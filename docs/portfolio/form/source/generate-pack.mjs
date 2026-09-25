import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { form, formGridTile } from '../content/form.ts';
const root=path.resolve(import.meta.dirname,'..');
const definitions=[
 ['form-thumbnail.webp','core','Grid cover','Square Form banner in Urbanist typography, with a lime frame, rounded white panel and an actual furnished-room render.','1200 × 1200 px · Square cover for the portfolio grid.'],
 ['form-hero.webp','core','Case-study hero','Form room studio with Urbanist type, a lime surround and the finished loft render.','Make room for your ideas.'],
 ['form-workspace.webp','core','Lead image','The actual Form Design workspace with a furniture library alongside an editable room photograph.','Real app screenshot. Furniture remains approximate until rendering.'],
 ['form-before-after.webp','core','The idea','The original empty loft beside an actual AI-generated furnished version from Form.','Original photo and AI-generated still. Generated details and placement may vary.'],
 ['form-focus.webp','core','The workspace','Actual Form focus mode with a selected chair and controls for size, position, rotation and colour.','Selected furniture remains editable over the original photograph.'],
 ['form-export.webp','core','How it is built','Actual Form export dialog showing the finished render, format and resolution options.','JPEG, PNG, WebP and PDF. Larger presets upscale the existing image.'],
 ['form-room-original.webp','optional','Original photograph','Original unfurnished loft photograph from the active Form draft.','Source photograph from the existing user draft.'],
 ['form-room-rendered.webp','optional','Native render','Actual AI-generated loft furnishing result produced by Form.','Native 1536 × 1024 output from the app, without presentation framing.'],
 ['form-design-raw.webp','optional','Design screenshot','Actual Form Design workspace with seven furniture pieces.','Unframed app capture.'],
 ['form-editing-raw.webp','optional','Editing screenshot','Actual Form workspace with room contents and selected chair properties.','Unframed app capture.'],
 ['form-focus-raw.webp','optional','Focus screenshot','Actual Form focus mode with floating furniture controls.','Unframed app capture.'],
 ['form-rendered-workspace-raw.webp','optional','Rendered screenshot','Actual Form Rendered view with a finished AI-generated room.','Unframed app capture.'],
 ['form-export-raw.webp','optional','Export screenshot','Actual Form export dialog over the room workspace.','Unframed app capture.']
];
const assets=[];
for(const [file,set,role,alt,caption] of definitions){
 const p=path.join(root,'assets',file),m=await sharp(p).metadata(),stat=await fs.stat(p);
 if(m.format!=='webp'||!m.width||!m.height)throw Error('Invalid image '+file);
 assets.push({file:'assets/'+file,portfolioPath:'/assets/'+file,set,role,alt,caption,width:m.width,height:m.height,bytes:stat.size,source:role.includes('render')||file==='form-room-rendered.webp'?'Form local app and its explicit AI render':'Actual Form app capture; branded frames are portfolio presentation artwork'});
}
const pngPath=path.join(root,'assets/form-thumbnail.png');
const png=await sharp(pngPath).metadata();
if(png.width!==1200||png.height!==1200)throw Error('Grid PNG must be 1200 × 1200');
const grid=assets.find(a=>a.file==='assets/form-thumbnail.webp');
if(grid.width!==1200||grid.height!==1200)throw Error('Grid WebP must be 1200 × 1200');
grid.alternatives=[{file:'assets/form-thumbnail.png',format:'png',width:1200,height:1200,bytes:(await fs.stat(pngPath)).size}];
const used=[formGridTile.image,form.heroImage,form.leadImage,...form.sections.flatMap(s=>s.images)];
for(const p of used)if(!assets.find(a=>a.portfolioPath===p))throw Error('Missing content image '+p);
await fs.writeFile(path.join(root,'ASSET-MANIFEST.json'),JSON.stringify({version:1,prepared:'2026-09-25',theme:'Sunbeam-inspired portfolio presentation only',typeface:'Urbanist',reference:'https://sunbeam.framer.media/',fontReference:'https://fonts.google.com/specimen/Urbanist',notes:['Live Form app appearance is unchanged.','AI-generated still is an actual successful Form app render.','Original photograph comes from the existing user draft; external licence was not recorded.','Core content uses six images. Optional images are alternatives, not extra grid tiles.'],assets},null,2)+'\n');
await fs.writeFile(path.join(root,'CASE-STUDY.md'),'# Form\n\n**Make room for your ideas.**\n\n'+form.summary+'\n\n'+form.sections.map(s=>'## '+s.title+'\n\n'+s.copy+'\n\n![Form '+s.title+']('+s.images[0].replace('/assets/','assets/')+')').join('\n\n')+'\n\n## Project details\n\n- Role: product design and full-stack development.\n- Status: working prototype.\n- Focus: photo-based furnishing, editable furniture, on-demand rendering and export.\n- Presentation: Urbanist, lime accents and rounded white panels, inspired by Sunbeam. The live app retains its current styling.\n- No adoption or business-impact metrics have been established.\n');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const cards=assets.map((a)=>`<article class="asset" data-set="${a.set}"><a href="${a.file}" target="_blank" rel="noopener"><img src="${a.file}" loading="lazy" alt="${escape(a.alt)}"></a><div class="asset-copy"><span>${a.set==='core'?'Core image':'Optional image'} · ${a.width} × ${a.height}</span><h3>${escape(a.role)}</h3><p>${escape(a.caption)}</p><a class="download" href="${a.file}" download>Download WebP <span aria-hidden="true">↗</span></a>${a.alternatives?'<a class="download" style="margin-left:20px" href="assets/form-thumbnail.png" download>Download PNG <span aria-hidden="true">↗</span></a>':''}</div></article>`).join('');
const sections=form.sections.map(s=>`<section class="case-section"><div><h3>${escape(s.title)}</h3><p>${escape(s.copy)}</p></div><img src="${s.images[0].replace('/assets/','assets/')}" loading="lazy" alt="${escape(assets.find(a=>a.portfolioPath===s.images[0]).alt)}"></section>`).join('');
let template=await fs.readFile(path.join(root,'source/preview-template.html'),'utf8');
template=template.replace('<!-- ASSET_CARDS -->',cards).replace('<!-- SUMMARY -->',escape(form.summary)).replace('<!-- CASE_SECTIONS -->',sections);
await fs.writeFile(path.join(root,'index.html'),template);
console.log(`Validated ${assets.length} WebP images, ${used.length} case-study image references, generated manifest, copy and preview.`);
