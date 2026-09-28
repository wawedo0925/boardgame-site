const assert=require('node:assert/strict'),fs=require('fs');
const manifest=fs.readFileSync('app/manifest.ts','utf8');
const layout=fs.readFileSync('app/layout.tsx','utf8');
assert.match(manifest,/background_color:\s*"#0b274d"/);
assert.match(manifest,/theme_color:\s*"#0b274d"/);
assert.match(layout,/themeColor:\s*"#0b274d"/);
console.log('PASS: installed app splash and browser chrome use the logo background color');
