"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  forgetExamplePrefetch,
  prefetchExamples,
} from "@/lib/example-prefetch";
import {
  COUNTRIES,
  EXAMPLES,
  type Candidate,
  type Country,
  type MatchResponse,
  type SetupStatus,
} from "@/lib/types";

const sourceLabel = {
  catalogue: "Catalogue",
  web: "Web",
  both: "Catalogue + web",
};
function date(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function price(candidate: Candidate) {
  const { price, currency } = candidate.offer;
  if (price === null || !currency) return "See retailer";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}
function ProductImage({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="product-image image-unavailable">Image unavailable</div>
  ) : (
    <img
      className="product-image"
      src={src}
      alt={name}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
function ResultsTable({ items }: { items: Candidate[] }) {
  return (
    <div className="table-scroll">
      <table>
        <caption className="sr-only">
          Furniture matches ranked by visual resemblance
        </caption>
        <thead>
          <tr>
            <th scope="col">Piece</th>
            <th scope="col">Retailer</th>
            <th scope="col">Price</th>
            <th scope="col">Availability</th>
            <th scope="col">Source</th>
            <th scope="col">
              <span className="sr-only">Purchase link</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id}>
              <td>
                <div className="product">
                  <span className="rank">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <ProductImage src={item.imageUrl} name={item.name} />
                  <div className="product-description">
                    <h3>{item.name}</h3>
                    <p>{item.comparison}</p>
                  </div>
                </div>
              </td>
              <td className="retailer">{item.offer.retailer}</td>
              <td className="price">
                {price(item)}
                <span className="cell-note">Listed price</span>
              </td>
              <td>
                <span className="availability">
                  <span className="status-dot" />
                  In stock
                </span>
                <span className="cell-note">
                  Delivers to {COUNTRIES[item.offer.country].name}
                </span>
                <details className="evidence">
                  <summary>Checked {date(item.offer.checkedAt)}</summary>
                  <p>
                    {item.offer.stockEvidence?.detail}{" "}
                    {item.offer.shippingEvidence?.detail}
                  </p>
                  <p>{item.offer.restrictions}</p>
                  <a
                    href={item.offer.shippingEvidence?.url || item.offer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View delivery evidence ↗
                  </a>
                </details>
              </td>
              <td>
                <span className={`source-tag source-${item.source}`}>
                  {sourceLabel[item.source]}
                </span>
              </td>
              <td>
                <a
                  className="shop-link"
                  href={item.offer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View ${item.name} at ${item.offer.retailer}`}
                >
                  View <span aria-hidden="true">↗</span>
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Matcher({ setup }: { setup: SetupStatus }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [country, setCountry] = useState<Country>("SE");
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cachedExamplesCount, setCachedExamplesCount] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const selection = useRef(0);

  useEffect(() => {
    let current = true;
    void prefetchExamples(country).then(({ results }) => {
      if (current) setCachedExamplesCount(Object.keys(results).length);
    });
    return () => {
      current = false;
    };
  }, [country]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);
  useEffect(() => {
    return () => request.current?.abort();
  }, []);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [busy]);

  function chooseFile(next: File, sample: string | null = null) {
    selection.current++;
    setError(null);
    setResult(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (!next.size || next.size > 10_000_000) {
      setError("Choose an image smaller than 10 MB.");
      return;
    }
    setFile(next);
    setSelected(sample);
    setPreview(URL.createObjectURL(next));
  }
  async function chooseExample(example: (typeof EXAMPLES)[number]) {
    const token = ++selection.current;
    try {
      const response = await fetch(example.image);
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      if (token !== selection.current) return;
      chooseFile(
        new File([blob], `${example.file}.png`, { type: "image/png" }),
        example.file,
      );
    } catch {
      if (token === selection.current)
        setError("This example could not be loaded. Try uploading an image.");
    }
  }
  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!file || busy) return;
    selection.current++;
    setBusy(true);
    setElapsed(0);
    setError(null);
    setResult(null);
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 300_000);
    try {
      if (selected) {
        const saved = (await prefetchExamples(country)).results[selected];
        if (
          saved &&
          saved.country === country &&
          Date.parse(saved.cacheValidUntil || "") > Date.now()
        ) {
          setResult(saved);
          return;
        }
      }
      const body = new FormData();
      body.append("image", file);
      body.append("country", country);
      const response = await fetch("/api/match", {
        method: "POST",
        body,
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "Something went wrong. Please try again.",
        );
      setResult(data as MatchResponse);
      if (selected) forgetExamplePrefetch(country);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name === "AbortError"
          ? "The search took too long. Please try again."
          : cause instanceof Error
            ? cause.message
            : "Could not connect. Please try again.",
      );
    } finally {
      clearTimeout(timeout);
      setBusy(false);
      request.current = null;
    }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Form home">
          form<span className="wordmark-dot">.</span>
        </Link>
        <span className="header-note">A good eye. A little help.</span>
        <span className="demo-label">
          FURNITURE FINDER <span> / </span> DEMO
        </span>
      </header>
      <main>
        <section className="intro">
          <div>
            <p className="eyebrow">FROM INSPIRATION TO YOUR SPACE</p>
            <h1>Find a similar piece.</h1>
            <p className="intro-description">
              Start with a photo. Discover furniture and art with the same feel.
            </p>
          </div>
          <span className="intro-note">
            Your reference,
            <br />a few good possibilities.
          </span>
        </section>
        {!setup.ready && (
          <details className="setup-notice">
            <summary>
              <span className="notice-dot" />
              Live matching needs setup{" "}
              <span className="notice-hint">View details</span>
            </summary>
            <p>
              Add <code>{setup.missing.join(", ")}</code> to{" "}
              <code>.env.local</code>, apply the supplied Supabase migration,
              import the catalogue, then restart. You can explore the sample
              images below.
            </p>
          </details>
        )}
        <div className="workspace">
          <aside className="reference-panel">
            <form onSubmit={search}>
              <div className="panel-heading">
                <h2>Your reference</h2>
                <span>01</span>
              </div>
              <input
                ref={input}
                className="sr-only"
                type="file"
                id="image-upload"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(event) => {
                  const next = event.target.files?.[0];
                  if (next) chooseFile(next);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                className={`upload-area ${preview ? "has-image" : ""} ${dragging ? "is-dragging" : ""}`}
                disabled={busy}
                onClick={() => input.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!busy) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  if (!busy && event.dataTransfer.files[0])
                    chooseFile(event.dataTransfer.files[0]);
                }}
                aria-label={
                  file ? "Change reference image" : "Upload reference image"
                }
              >
                {preview ? (
                  <>
                    <img
                      src={preview}
                      alt="Your reference furniture or artwork"
                    />
                    <span className="change-image">Change image ↗</span>
                  </>
                ) : (
                  <>
                    <span className="upload-symbol" aria-hidden="true">
                      ＋
                    </span>
                    <strong>Add a reference image</strong>
                    <span>Drop a photo here or browse</span>
                    <small>JPG, PNG or WebP · up to 10 MB</small>
                  </>
                )}
              </button>
              {file && (
                <p className="file-name" title={file.name}>
                  {file.name}
                  <span>{Math.max(1, Math.round(file.size / 1024))} KB</span>
                </p>
              )}
              <div className="country-field">
                <label htmlFor="country">Shopping in</label>
                <select
                  id="country"
                  value={country}
                  disabled={busy}
                  onChange={(event) => {
                    setCachedExamplesCount(0);
                    setCountry(event.target.value as Country);
                    setResult(null);
                    setError(null);
                  }}
                >
                  {Object.entries(COUNTRIES).map(([code, value]) => (
                    <option key={code} value={code}>
                      {value.name}
                    </option>
                  ))}
                </select>
                <p>We check stock and country delivery.</p>
              </div>
              <button
                className="search-button"
                type="submit"
                disabled={!file || busy}
              >
                {busy ? (
                  <>
                    <span className="spinner" />
                    Finding your matches
                  </>
                ) : (
                  <>
                    Find similar pieces <span aria-hidden="true">↗</span>
                  </>
                )}
              </button>
              <p className="privacy-note">One cropped piece works best.</p>
            </form>
          </aside>
          <section
            className="results-panel"
            aria-label="Search results"
            aria-busy={busy}
          >
            <div className="results-heading">
              <div>
                <p className="eyebrow">THE SHORTLIST</p>
                <h2>
                  {result
                    ? `${result.matches.length} ${result.matches.length === 1 ? "piece" : "pieces"} to consider`
                    : "A closer look, a better match."}
                </h2>
              </div>
              <span className="results-country">{COUNTRIES[country].name}</span>
            </div>
            {error && (
              <div className="error-notice" role="alert">
                <strong>We couldn’t finish that search.</strong>
                <p>{error}</p>
              </div>
            )}
            {busy ? (
              <div className="loading-state" role="status">
                <div className="loading-heading">
                  <span className="spinner" />
                  <div>
                    <strong>Looking for the right details.</strong>
                    <p>
                      Searching the catalogue and the web, then comparing
                      product photos.
                    </p>
                  </div>
                  <span className="elapsed">{elapsed}s</span>
                </div>
                <div className="skeleton-list" aria-hidden="true">
                  {[0, 1, 2, 3].map((index) => (
                    <div className="skeleton-row" key={index}>
                      <span />
                      <div>
                        <i />
                        <i />
                      </div>
                      <b />
                    </div>
                  ))}
                </div>
                <p className="loading-note">
                  Live searches can take a couple of minutes.
                </p>
              </div>
            ) : result ? (
              <>
                <div className="result-meta">
                  <span>Ordered by visual resemblance</span>
                  <span>
                    {result.cached ? "Cached search" : "Fresh search"} ·{" "}
                    {date(result.generatedAt)}
                  </span>
                </div>
                <div className="source-status">
                  {(["catalogue", "web"] as const).map((source) => (
                    <details
                      key={source}
                      className={`source-state state-${result.sources[source].state}`}
                    >
                      <summary>
                        <span className="status-dot" />
                        {source === "web"
                          ? "Web discovery"
                          : "Internal catalogue"}
                        <span>
                          {result.sources[source].state === "unavailable"
                            ? "Unavailable"
                            : result.sources[source].state === "partial"
                              ? "Limited"
                              : `${result.sources[source].count} candidates`}
                        </span>
                      </summary>
                      <p>{result.sources[source].message}</p>
                    </details>
                  ))}
                </div>
                {result.matches.length ? (
                  <ResultsTable items={result.matches} />
                ) : (
                  <div className="no-matches">
                    <h3>No purchasable matches verified.</h3>
                    <p>
                      We couldn’t confirm a close visual match with current
                      stock and delivery evidence for {COUNTRIES[country].name}.
                      Try a clearer crop or a different country.
                    </p>
                  </div>
                )}
                <p className="result-footnote">
                  Similar pieces, selected by appearance. Prices and stock were
                  observed at the times shown. Confirm final price and postcode
                  delivery with the retailer.
                </p>
                {result.unverified.length > 0 && (
                  <details className="unverified">
                    <summary>
                      <span className="unverified-heading">
                        <strong>Worth a look</strong>
                        <span>Availability unconfirmed</span>
                      </span>
                      <span className="unverified-count">
                        {result.unverified.length}
                      </span>
                    </summary>
                    <p>
                      These are outside the purchasable shortlist because stock
                      or country delivery could not be confirmed.
                    </p>
                    <div className="unverified-list">
                      {result.unverified.map((item) => (
                        <article key={item.id}>
                          <ProductImage src={item.imageUrl} name={item.name} />
                          <div className="unverified-content">
                            <h3>{item.name}</h3>
                            <p>{item.comparison}</p>
                            <div className="unverified-meta">
                              <span className="unverified-status">
                                {item.offer.stock === "unknown"
                                  ? "Stock unconfirmed"
                                  : "Availability needs checking"}
                              </span>
                              <span>
                                {item.offer.retailer} ·{" "}
                                {sourceLabel[item.source]}
                              </span>
                            </div>
                          </div>
                          <a
                            className="unverified-link"
                            href={item.offer.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Check ${item.name} at ${item.offer.retailer}`}
                          >
                            Check listing <span aria-hidden="true">↗</span>
                          </a>
                        </article>
                      ))}
                    </div>
                  </details>
                )}
                <details className="reference-description">
                  <summary>What we saw in your reference</summary>
                  <p>{result.description}</p>
                </details>
              </>
            ) : (
              !error && (
                <div className="empty-state">
                  <div className="empty-illustration" aria-hidden="true">
                    <div className="illustration-frame">
                      <img src="/examples/wooden-chair.png" alt="" />
                    </div>
                    <div className="illustration-line" />
                    <div className="illustration-frame second">
                      <img src="/examples/cantilever-chair.png" alt="" />
                      <span>↗</span>
                    </div>
                  </div>
                  <h3>Same feel. New possibilities.</h3>
                  <p>
                    Upload a piece you love, or try an example below.
                    <br />
                    Your closest available matches will appear here.
                  </p>
                  <div className="empty-steps">
                    <span>
                      <b>01</b> Add a photo
                    </span>
                    <span>
                      <b>02</b> Pick a country
                    </span>
                    <span>
                      <b>03</b> Compare pieces
                    </span>
                  </div>
                </div>
              )
            )}
          </section>
        </div>
        <section
          className="examples"
          aria-label="Example images from the brief"
        >
          <div className="examples-heading">
            <h2>Start with an example</h2>
            <span>
              {cachedExamplesCount
                ? `${cachedExamplesCount} of 6 examples cached for ${COUNTRIES[country].name}.`
                : "Six crops from the brief. Pick any piece."}
            </span>
          </div>
          <div className="example-grid">
            {EXAMPLES.map((example, index) => (
              <button
                type="button"
                key={example.file}
                className={`example ${selected === example.file ? "selected" : ""}`}
                disabled={busy}
                onClick={() => chooseExample(example)}
                aria-pressed={selected === example.file}
              >
                <span className="example-image">
                  <img src={example.image} alt="" />
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </span>
                <span className="example-name">
                  {example.name}
                  <span aria-hidden="true">
                    {selected === example.file ? "✓" : "↗"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>
      <footer>
        <span>
          form. <span>Find your kind of furniture.</span>
        </span>
        <span>Catalogue + live web discovery</span>
      </footer>
    </div>
  );
}
