// Offline: build webp (384w/768w) siblings for the home gallery thumbnails.
// Source: public/wp-content/uploads copies of the CDN jpgs. Output: public/img-opt + src/data/img-opt.json
import sharp from 'sharp';
import fs from 'node:fs';
import crypto from 'node:crypto';
const SRC = [
 '2020/09/RAM-Promaster-City-2019-Partial-Zuccarini','2020/08/Partial-Wrap-Van-HomeFree-Nissan-Back-After',
 '2020/08/Partial-Wrap-Truck-Hungarock-Seirra-Side-After','2020/08/Partial-Wrap-Car-Fine-Tune-Auto-Mustang-Saleen-Side-After-vinyl-wrap-Toronto',
 '2020/08/Chevrolet-Silverado-2018-Decals-PandK-Roofing','2020/08/Full-Wrap-Truck-Nissan-Frontier',
 '2020/08/Mazda-3-2019-Decals-Personal','2020/08/Hyundai-Veloster-2016-Full-Wrap-Personal-1'];
fs.mkdirSync('public/img-opt',{recursive:true});
const map={};
for (const k of SRC){
  const f=`public/wp-content/uploads/${k}-768x432.jpg`; const buf=fs.readFileSync(f);
  const h=crypto.createHash('sha1').update(buf).digest('hex').slice(0,8);
  const base=k.split('/').pop(); const o={};
  for (const w of [384,768]){
    const name=`${base}-${h}-${w}.webp`;
    const out=await sharp(buf).resize(w,Math.round(w*432/768),{kernel:'lanczos3'}).webp({quality:82,effort:6}).toBuffer();
    fs.writeFileSync('public/img-opt/'+name,out); o[w]=`/img-opt/${name}`;
    if(w===768){ // fidelity vs source
      const a=await sharp(out).raw().toBuffer(); const b=await sharp(buf).raw().toBuffer();
      let se=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];se+=d*d}
      o.psnr=+(10*Math.log10(255*255/(se/a.length))).toFixed(1); o.jpgBytes=buf.length; o.webpBytes=out.length;
    }
  }
  map[`/wp-content/uploads/${k}-768x432.jpg`]=o;
}
fs.writeFileSync('src/data/img-opt.json',JSON.stringify(map,null,1));
for(const [k,v] of Object.entries(map))console.log(k.split('/').pop(),v.jpgBytes,v.webpBytes,v.psnr);
