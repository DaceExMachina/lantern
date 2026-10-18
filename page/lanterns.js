// The three lanterns, landing spots on them, the warm and cool palettes, and seeded randomness.

// ---- lantern styles -----------------------------------------------------------------------------------------
// Each style is drawn behind and in front of one shared flame. `flame` places the flame's base and sets its size,
// `light` is where the glow and threads come from, `paper` softens the flame as if it's behind paper, and `body`
// is the surface moths land on: its top and bottom, and its half-width at a given height.
const FLAME = `<g id="flame"><path id="fHalo" filter="url(#soft)" opacity="0.8"/><path id="fOuter"/><path id="fMid"/><path id="fCore"/>
  <ellipse id="fBase" cx="340" cy="384" rx="10" ry="5" opacity="0.55"/></g><g id="sparks"></g>`;
const MOCK = (svg, dy = 0) => `<g transform="translate(112 ${20 + dy}) scale(2.4)">${svg}</g>`; // drawn on the mockup's 190-wide tile, centred on 340; dy nudges it down
const PAPER_GRAD = cy => `<defs><radialGradient id="pg" cy="${cy}" r=".65"><stop class="paperStop" offset="0" stop-opacity=".9"/><stop class="paperStop" offset="1" stop-opacity="0"/></radialGradient></defs>`;
const STYLES = {
  barrel: {
    name: 'Book-page barrel', flame: [340, 388, 1], light: [340, 350], paper: true, tassel: [340, 462],
    body: { top: 216, bottom: 445, half: y => { const t = (y - 216) / 229; return 50 + 80 * t * (1 - t); } },
    back: `<path d="M340 20 L340 193" stroke="#C9B49C" stroke-width="2"/>
    <circle cx="340" cy="196" r="4" fill="none" stroke="#A8876A" stroke-width="1.6"/>
    <path id="paperShape" d="M290 216 Q250 330 290 445 L390 445 Q430 330 390 216 Z" fill="url(#paperShade)"/>
    <rect id="paperGlow" x="250" y="216" width="180" height="230" fill="url(#paperGrad)" clip-path="url(#bodyClip)"/>
    <path id="paperTint" d="M290 216 Q250 330 290 445 L390 445 Q430 330 390 216 Z"/>`,
    front: `<path d="M290 216 Q250 330 290 445 L390 445 Q430 330 390 216 Z" fill="#F2DCC0" opacity="0.2"/>
    <g fill="none" stroke="#C9A684" stroke-width="0.9" opacity="0.5"><path d="M284.1 234.3Q340 239.3 395.9 234.3"/><path d="M276.3 266.4Q340 271.4 403.7 266.4"/><path d="M271.6 298.4Q340 303.4 408.4 298.4"/><path d="M270.0 330.5Q340 335.5 410.0 330.5"/><path d="M271.6 362.6Q340 367.6 408.4 362.6"/><path d="M276.3 394.6Q340 399.6 403.7 394.6"/><path d="M284.1 426.7Q340 431.7 395.9 426.7"/></g>
    <g fill="none" stroke="#C8A07A" stroke-width="1.6" opacity="0.85"><path d="M302 216 Q274 330 302 445"/><path d="M321 216 Q309 330 321 445"/><path d="M340 216 L340 445"/><path d="M359 216 Q371 330 359 445"/><path d="M378 216 Q406 330 378 445"/></g>
    <g fill="none" stroke="#FFF4E4" stroke-width="0.8" opacity="0.55" transform="translate(1.6 0)"><path d="M302 216 Q274 330 302 445"/><path d="M321 216 Q309 330 321 445"/><path d="M340 216 L340 445"/><path d="M359 216 Q371 330 359 445"/><path d="M378 216 Q406 330 378 445"/></g>
    <g stroke="#B99572" stroke-width="1.3" opacity="0.8">
      <path d="M275 260 L305 262"/><path d="M272 275 L307 277"/><path d="M270 290 L300 291"/>
      <path d="M375 380 L405 378"/><path d="M373 395 L408 393"/><path d="M376 410 L400 408"/>
      <path d="M347 250 L355 250"/><path d="M347 262 L356 262"/>
    </g>
    <rect x="313" y="199" width="54" height="18" rx="4" fill="url(#capGrad)"/>
    <path d="M317 203.5 H363" stroke="#C47A55" stroke-width="1" opacity="0.7"/>
    <path d="M313 213 H367" stroke="#5E2E1E" stroke-width="1" opacity="0.5"/>
    <rect x="313" y="444" width="54" height="16" rx="4" fill="url(#capGrad)"/>
    <path d="M317 448 H363" stroke="#C47A55" stroke-width="1" opacity="0.7"/>
    <g id="tassel">
      <path d="M340 460 V466" stroke="#8A4A32" stroke-width="2"/>
      <circle cx="340" cy="469" r="3.8" fill="#9C5536"/>
      <rect x="336" y="474" width="8" height="4" rx="1.5" fill="#B0694A"/>
      <g stroke="#8A4A32" stroke-width="1.3" stroke-linecap="round">
        <path d="M338 478 L333 500"/><path d="M339 478 L337 503"/><path d="M340 478 L340 505"/><path d="M341 478 L343 503"/><path d="M342 478 L347 500"/>
      </g>
    </g>`,
  },
  chochin: {
    name: 'Round chōchin', flame: [340, 379, 0.95], light: [340, 336], paper: true, tassel: [95, 177], // pivot in the drawing's own units
    body: { top: 240, bottom: 422, half: y => 124.8 * Math.sqrt(Math.max(0, 1 - ((y - 330.8) / 115.2) ** 2)) }, // centred on the glow rings (y 330)
    back: MOCK(`${PAPER_GRAD('.6')}<path d="M95 -7.5V66" stroke="#C9B49C" stroke-width="0.8"/>
      <ellipse cx="95" cy="122" rx="52" ry="48" fill="#F3ECE2"/><ellipse id="paperGlow" cx="95" cy="122" rx="52" ry="48" fill="url(#pg)"/>
      <ellipse id="paperTint" cx="95" cy="122" rx="52" ry="48"/>`, 18),
    front: MOCK(`<ellipse cx="95" cy="122" rx="52" ry="48" fill="#F3ECE2" opacity="0.22"/>
      <g fill="none" stroke="#C9BBA8" stroke-width="0.55" opacity="0.9"><path d="M69.8 80Q95 85 120.2 80"/><path d="M56.2 90Q95 95 133.8 90"/><path d="M48.8 100Q95 105 141.2 100"/><path d="M44.7 110Q95 115 145.3 110"/><path d="M43.0 120Q95 125 147.0 120"/><path d="M43.7 130Q95 135 146.3 130"/><path d="M46.8 140Q95 145 143.2 140"/><path d="M52.8 150Q95 155 137.2 150"/><path d="M63.2 160Q95 165 126.8 160"/></g>
      <path d="M95 74V170" stroke="#C9BBA8" stroke-width="0.4" opacity="0.6"/>
      <rect x="76" y="66" width="38" height="9" rx="2" fill="#2A1E1E"/><rect x="76" y="68" width="38" height="1.2" fill="#4A3434"/>
      <rect x="76" y="168" width="38" height="9" rx="2" fill="#2A1E1E"/>
      <g id="tassel"><path d="M95 177V194" stroke="#2A1E1E" stroke-width="1"/><circle cx="95" cy="196" r="2.6" fill="#D9AE52"/>
        <path d="M93.5 198L92 210M95 198V212M96.5 198L98 210" stroke="#D9AE52" stroke-width="0.6"/></g>`, 18),
  },
  moroccan: {
    hang: ['#B8873A', 2.6, '5 4'], // carries the chain on up to the top
    name: 'Brass Moroccan', flame: [340, 392, 0.9], light: [340, 340], tassel: [340, 444],
    body: { top: 282, bottom: 400, half: y => y < 340 ? 52 + (y - 278) / 62 * 12 : 64 - (y - 340) / 64 * 12 },
    back: `<defs><linearGradient id="brass" x1="0" x2="1"><stop offset="0" stop-color="#6E4618"/><stop offset=".45" stop-color="#D9AE52"/><stop offset="1" stop-color="#7A501C"/></linearGradient>
      <mask id="cutouts" maskUnits="userSpaceOnUse" x="260" y="200" width="160" height="260"><rect x="260" y="200" width="160" height="260" fill="#fff"/><g fill="#000"><polygon points="326.0,296.0 327.3,299.0 330.2,297.8 329.0,300.7 332.0,302.0 329.0,303.3 330.2,306.2 327.3,305.0 326.0,308.0 324.7,305.0 321.8,306.2 323.0,303.3 320.0,302.0 323.0,300.7 321.8,297.8 324.7,299.0"/><polygon points="340.0,296.0 341.3,299.0 344.2,297.8 343.0,300.7 346.0,302.0 343.0,303.3 344.2,306.2 341.3,305.0 340.0,308.0 338.7,305.0 335.8,306.2 337.0,303.3 334.0,302.0 337.0,300.7 335.8,297.8 338.7,299.0"/><polygon points="354.0,296.0 355.3,299.0 358.2,297.8 357.0,300.7 360.0,302.0 357.0,303.3 358.2,306.2 355.3,305.0 354.0,308.0 352.7,305.0 349.8,306.2 351.0,303.3 348.0,302.0 351.0,300.7 349.8,297.8 352.7,299.0"/><polygon points="293.0,297.0 293.6,299.5 295.1,298.5 294.5,300.9 296.0,302.0 294.5,303.1 295.1,305.5 293.6,304.5 293.0,307.0 292.4,304.5 290.9,305.5 291.5,303.1 290.0,302.0 291.5,300.9 290.9,298.5 292.4,299.5"/><polygon points="387.0,297.0 387.6,299.5 389.1,298.5 388.5,300.9 390.0,302.0 388.5,303.1 389.1,305.5 387.6,304.5 387.0,307.0 386.4,304.5 384.9,305.5 385.5,303.1 384.0,302.0 385.5,300.9 384.9,298.5 386.4,299.5"/><polygon points="333.0,314.0 334.3,317.0 337.2,315.8 336.0,318.7 339.0,320.0 336.0,321.3 337.2,324.2 334.3,323.0 333.0,326.0 331.7,323.0 328.8,324.2 330.0,321.3 327.0,320.0 330.0,318.7 328.8,315.8 331.7,317.0"/><polygon points="347.0,314.0 348.3,317.0 351.2,315.8 350.0,318.7 353.0,320.0 350.0,321.3 351.2,324.2 348.3,323.0 347.0,326.0 345.7,323.0 342.8,324.2 344.0,321.3 341.0,320.0 344.0,318.7 342.8,315.8 345.7,317.0"/><polygon points="293.0,315.0 293.6,317.5 295.1,316.5 294.5,318.9 296.0,320.0 294.5,321.1 295.1,323.5 293.6,322.5 293.0,325.0 292.4,322.5 290.9,323.5 291.5,321.1 290.0,320.0 291.5,318.9 290.9,316.5 292.4,317.5"/><polygon points="387.0,315.0 387.6,317.5 389.1,316.5 388.5,318.9 390.0,320.0 388.5,321.1 389.1,323.5 387.6,322.5 387.0,325.0 386.4,322.5 384.9,323.5 385.5,321.1 384.0,320.0 385.5,318.9 384.9,316.5 386.4,317.5"/><polygon points="326.0,332.0 327.3,335.0 330.2,333.8 329.0,336.7 332.0,338.0 329.0,339.3 330.2,342.2 327.3,341.0 326.0,344.0 324.7,341.0 321.8,342.2 323.0,339.3 320.0,338.0 323.0,336.7 321.8,333.8 324.7,335.0"/><polygon points="340.0,332.0 341.3,335.0 344.2,333.8 343.0,336.7 346.0,338.0 343.0,339.3 344.2,342.2 341.3,341.0 340.0,344.0 338.7,341.0 335.8,342.2 337.0,339.3 334.0,338.0 337.0,336.7 335.8,333.8 338.7,335.0"/><polygon points="354.0,332.0 355.3,335.0 358.2,333.8 357.0,336.7 360.0,338.0 357.0,339.3 358.2,342.2 355.3,341.0 354.0,344.0 352.7,341.0 349.8,342.2 351.0,339.3 348.0,338.0 351.0,336.7 349.8,333.8 352.7,335.0"/><polygon points="293.0,333.0 293.6,335.5 295.1,334.5 294.5,336.9 296.0,338.0 294.5,339.1 295.1,341.5 293.6,340.5 293.0,343.0 292.4,340.5 290.9,341.5 291.5,339.1 290.0,338.0 291.5,336.9 290.9,334.5 292.4,335.5"/><polygon points="387.0,333.0 387.6,335.5 389.1,334.5 388.5,336.9 390.0,338.0 388.5,339.1 389.1,341.5 387.6,340.5 387.0,343.0 386.4,340.5 384.9,341.5 385.5,339.1 384.0,338.0 385.5,336.9 384.9,334.5 386.4,335.5"/><polygon points="333.0,350.0 334.3,353.0 337.2,351.8 336.0,354.7 339.0,356.0 336.0,357.3 337.2,360.2 334.3,359.0 333.0,362.0 331.7,359.0 328.8,360.2 330.0,357.3 327.0,356.0 330.0,354.7 328.8,351.8 331.7,353.0"/><polygon points="347.0,350.0 348.3,353.0 351.2,351.8 350.0,354.7 353.0,356.0 350.0,357.3 351.2,360.2 348.3,359.0 347.0,362.0 345.7,359.0 342.8,360.2 344.0,357.3 341.0,356.0 344.0,354.7 342.8,351.8 345.7,353.0"/><polygon points="293.0,351.0 293.6,353.5 295.1,352.5 294.5,354.9 296.0,356.0 294.5,357.1 295.1,359.5 293.6,358.5 293.0,361.0 292.4,358.5 290.9,359.5 291.5,357.1 290.0,356.0 291.5,354.9 290.9,352.5 292.4,353.5"/><polygon points="387.0,351.0 387.6,353.5 389.1,352.5 388.5,354.9 390.0,356.0 388.5,357.1 389.1,359.5 387.6,358.5 387.0,361.0 386.4,358.5 384.9,359.5 385.5,357.1 384.0,356.0 385.5,354.9 384.9,352.5 386.4,353.5"/><polygon points="326.0,368.0 327.3,371.0 330.2,369.8 329.0,372.7 332.0,374.0 329.0,375.3 330.2,378.2 327.3,377.0 326.0,380.0 324.7,377.0 321.8,378.2 323.0,375.3 320.0,374.0 323.0,372.7 321.8,369.8 324.7,371.0"/><polygon points="340.0,368.0 341.3,371.0 344.2,369.8 343.0,372.7 346.0,374.0 343.0,375.3 344.2,378.2 341.3,377.0 340.0,380.0 338.7,377.0 335.8,378.2 337.0,375.3 334.0,374.0 337.0,372.7 335.8,369.8 338.7,371.0"/><polygon points="354.0,368.0 355.3,371.0 358.2,369.8 357.0,372.7 360.0,374.0 357.0,375.3 358.2,378.2 355.3,377.0 354.0,380.0 352.7,377.0 349.8,378.2 351.0,375.3 348.0,374.0 351.0,372.7 349.8,369.8 352.7,371.0"/><polygon points="293.0,369.0 293.6,371.5 295.1,370.5 294.5,372.9 296.0,374.0 294.5,375.1 295.1,377.5 293.6,376.5 293.0,379.0 292.4,376.5 290.9,377.5 291.5,375.1 290.0,374.0 291.5,372.9 290.9,370.5 292.4,371.5"/><polygon points="387.0,369.0 387.6,371.5 389.1,370.5 388.5,372.9 390.0,374.0 388.5,375.1 389.1,377.5 387.6,376.5 387.0,379.0 386.4,376.5 384.9,377.5 385.5,375.1 384.0,374.0 385.5,372.9 384.9,370.5 386.4,371.5"/><polygon points="333.0,386.0 334.3,389.0 337.2,387.8 336.0,390.7 339.0,392.0 336.0,393.3 337.2,396.2 334.3,395.0 333.0,398.0 331.7,395.0 328.8,396.2 330.0,393.3 327.0,392.0 330.0,390.7 328.8,387.8 331.7,389.0"/><polygon points="347.0,386.0 348.3,389.0 351.2,387.8 350.0,390.7 353.0,392.0 350.0,393.3 351.2,396.2 348.3,395.0 347.0,398.0 345.7,395.0 342.8,396.2 344.0,393.3 341.0,392.0 344.0,390.7 342.8,387.8 345.7,389.0"/><polygon points="293.0,387.0 293.6,389.5 295.1,388.5 294.5,390.9 296.0,392.0 294.5,393.1 295.1,395.5 293.6,394.5 293.0,397.0 292.4,394.5 290.9,395.5 291.5,393.1 290.0,392.0 291.5,390.9 290.9,388.5 292.4,389.5"/><polygon points="387.0,387.0 387.6,389.5 389.1,388.5 388.5,390.9 390.0,392.0 388.5,393.1 389.1,395.5 387.6,394.5 387.0,397.0 386.4,394.5 384.9,395.5 385.5,393.1 384.0,392.0 385.5,390.9 384.9,388.5 386.4,389.5"/><circle cx="333" cy="311" r="1.4"/><circle cx="347" cy="311" r="1.4"/><circle cx="326" cy="329" r="1.4"/><circle cx="340" cy="329" r="1.4"/><circle cx="354" cy="329" r="1.4"/><circle cx="333" cy="347" r="1.4"/><circle cx="347" cy="347" r="1.4"/><circle cx="326" cy="365" r="1.4"/><circle cx="340" cy="365" r="1.4"/><circle cx="354" cy="365" r="1.4"/><circle cx="333" cy="383" r="1.4"/><circle cx="347" cy="383" r="1.4"/><path d="M300 254q3 -6 6 0q-3 5 -6 0z"/><path d="M312 254q3 -6 6 0q-3 5 -6 0z"/><path d="M324 254q3 -6 6 0q-3 5 -6 0z"/><path d="M336 254q3 -6 6 0q-3 5 -6 0z"/><path d="M348 254q3 -6 6 0q-3 5 -6 0z"/><path d="M360 254q3 -6 6 0q-3 5 -6 0z"/><path d="M372 254q3 -6 6 0q-3 5 -6 0z"/><circle cx="314" cy="431" r="2"/><circle cx="324" cy="431" r="2"/><circle cx="334" cy="431" r="2"/><circle cx="344" cy="431" r="2"/><circle cx="354" cy="431" r="2"/><circle cx="364" cy="431" r="2"/></g></mask></defs>
      ${PAPER_GRAD('.55')}
      <ellipse cx="340" cy="24" rx="3.2" ry="4" fill="none" stroke="#B8873A" stroke-width="1.4"/><ellipse cx="340" cy="33" rx="2.2" ry="5" fill="none" stroke="#B8873A" stroke-width="1.4"/><ellipse cx="340" cy="42" rx="3.2" ry="4" fill="none" stroke="#B8873A" stroke-width="1.4"/><ellipse cx="340" cy="51" rx="2.2" ry="5" fill="none" stroke="#B8873A" stroke-width="1.4"/><ellipse cx="340" cy="60" rx="3.2" ry="4" fill="none" stroke="#B8873A" stroke-width="1.4"/><ellipse cx="340" cy="69" rx="2.2" ry="5" fill="none" stroke="#B8873A" stroke-width="1.4"/><ellipse cx="340" cy="78" rx="3.2" ry="4" fill="none" stroke="#B8873A" stroke-width="1.4"/><ellipse cx="340" cy="87" rx="2.2" ry="5" fill="none" stroke="#B8873A" stroke-width="1.4"/><ellipse cx="340" cy="96" rx="3.2" ry="4" fill="none" stroke="#B8873A" stroke-width="1.4"/><ellipse cx="340" cy="105" rx="2.2" ry="5" fill="none" stroke="#B8873A" stroke-width="1.4"/><ellipse cx="340" cy="114" rx="3.2" ry="4" fill="none" stroke="#B8873A" stroke-width="1.4"/><ellipse cx="340" cy="123" rx="2.2" ry="5" fill="none" stroke="#B8873A" stroke-width="1.4"/><ellipse cx="340" cy="132" rx="3.2" ry="4" fill="none" stroke="#B8873A" stroke-width="1.4"/><ellipse cx="340" cy="141" rx="2.2" ry="5" fill="none" stroke="#B8873A" stroke-width="1.4"/><circle cx="340" cy="153" r="4" fill="none" stroke="#C9973F" stroke-width="1.6"/>
      <path d="M340 157V208" stroke="#B8873A" stroke-width="2.2"/>
      <g fill="#24160A"><path d="M340 206C352 222 400 236 398 264L282 264C280 236 328 222 340 206Z"/><path d="M288 278L392 278L404 340L392 404L288 404L276 340Z"/><path d="M300 421L380 421L356 446L324 446Z"/></g>
      <ellipse id="paperGlow" cx="340" cy="345" rx="66" ry="70" fill="url(#pg)"/>`,
    front: `<path d="M336 160A7 7 0 1 0 344 172A5.5 5.5 0 1 1 336 160Z" fill="#E2B85C"/>
      <path d="M337.5 202L340 174L342.5 202Z" fill="#B8873A"/><circle cx="340" cy="203" r="4" fill="#D9AE52"/>
      <path d="M340 206C352 222 400 236 398 264L282 264C280 236 328 222 340 206Z" fill="url(#brass)" mask="url(#cutouts)"/>
      <path d="M340 208Q358 236 368 264M340 208Q322 236 312 264M340 208V264M340 208Q376 236 390 264M340 208Q304 236 290 264" fill="none" stroke="#5A3A12" stroke-width="0.9" opacity="0.7"/>
      <path d="M282 276q4.8 9 9.6 0q4.8 9 9.6 0q4.8 9 9.6 0q4.8 9 9.6 0q4.8 9 9.6 0q4.8 9 9.6 0q4.8 9 9.6 0q4.8 9 9.6 0q4.8 9 9.6 0q4.8 9 9.6 0q4.8 9 9.6 0q4.8 9 9.6 0V270H282Z" fill="url(#brass)"/><rect x="280" y="262" width="120" height="5" fill="#E2B85C"/>
      <path d="M288 278L392 278L404 340L392 404L288 404L276 340Z" fill="#4E3212" mask="url(#cutouts)"/>
      
      <path d="M316 400V312Q316 288 340 284Q364 288 364 312V400" fill="none" stroke="#E2B85C" stroke-width="2.2"/>
      <path d="M283 398L280 318Q283 296 304 292L309 400M397 398L400 318Q397 296 376 292L371 400" fill="none" stroke="#D9AE52" stroke-width="1.6"/>
      <path d="M288 278L276 340L288 404M392 278L404 340L392 404" fill="none" stroke="#E2B85C" stroke-width="2.4"/>
      <rect x="309" y="278" width="5" height="126" fill="url(#brass)"/><rect x="366" y="278" width="5" height="126" fill="url(#brass)"/>
      <rect x="284" y="404" width="112" height="9" rx="2" fill="url(#brass)"/><g fill="#E2B85C"><circle cx="292" cy="417" r="2.6"/><circle cx="300" cy="417" r="2.6"/><circle cx="308" cy="417" r="2.6"/><circle cx="316" cy="417" r="2.6"/><circle cx="324" cy="417" r="2.6"/><circle cx="332" cy="417" r="2.6"/><circle cx="340" cy="417" r="2.6"/><circle cx="348" cy="417" r="2.6"/><circle cx="356" cy="417" r="2.6"/><circle cx="364" cy="417" r="2.6"/><circle cx="372" cy="417" r="2.6"/><circle cx="380" cy="417" r="2.6"/><circle cx="388" cy="417" r="2.6"/></g>
      <path d="M300 421L380 421L356 446L324 446Z" fill="url(#brass)" mask="url(#cutouts)"/>
      <g id="tassel"><path d="M340 446V452" stroke="#B8873A" stroke-width="2"/><ellipse cx="340" cy="460" rx="6" ry="8" fill="url(#brass)"/><path d="M338 467L340 482L342 467Z" fill="#D9AE52"/></g>`,
  },
};
// which lantern is shared by every window (Dock app, iTerm panel, screensaver): the server keeps it in settings.json
let style = STYLES.barrel;
function applyStyle(key) {
  style = STYLES[key] || STYLES.barrel;
  const [fx, fy, fk] = style.flame;
  const [hc, hw, dash] = style.hang || ['#C9B49C', 2, ''];
  $('lantern').innerHTML = `<path id="hang" d="M340 ${VIEW.top - 2}V22" stroke="${hc}" stroke-width="${hw}" ${dash ? `stroke-dasharray="${dash}" stroke-linecap="round"` : ''}/>` + style.back
    + `<g ${style.paper ? 'filter="url(#behindPaper)"' : ''} transform="translate(${fx} ${fy}) scale(${fk}) translate(-340 -${FLAME_BASE})">${FLAME}</g>`
    + style.front;
  for (const m of moths.values()) m.wasLanded = false; // landed moths find new spots on the new lantern
  $('style').value = key;
}

// Somewhere on the lantern's surface: a random height, and a random way round from near the middle to the edge.
// The wing points straight out of the surface; seen from the front its sideways part shrinks toward the middle,
// so moths there show a shorter wing. Returns [x, y, wing angle, wing length].
// The spot sits in the slice of pie facing direction `a` (radians, from the lantern's middle), anywhere from a third
// of the way out to the rim: straight up lands on the upper front, straight out lands toward the edge, so moths whose
// homes sit in different directions never cross paths.
function pickPerch(a = Math.random() * 2 * Math.PI, rand = Math.random) {
  const { top, bottom, half } = style.body, side = Math.cos(a) < 0 ? -1 : 1, depth = 0.35 + rand() * 0.65;
  const y = top + (bottom - top) * (0.5 + 0.44 * Math.sin(a) * depth);
  const sin = Math.max(Math.sin(15 * Math.PI / 180), Math.abs(Math.cos(a)) * depth); // how far round the side, from the front
  const slope = (half(y + 1) - half(y - 1)) / 2, len = Math.hypot(1, slope); // how fast the surface bulges at this height
  // the surface's outward direction, as seen from the front; pulled halfway toward the side-on view at the rim, so a
  // moth near the middle still shows a proper side profile (not quite true to the curve, but it reads better)
  const px = side / len * (sin + 1) / 2, py = -slope / len;
  return [340 + side * half(y) * sin, y, Math.atan2(py, px) * 180 / Math.PI, Math.max(0.3, Math.hypot(px, py))];
}

// warm = everyone busy, cool = someone needs me; everything crossfades between the two
const WARM = { halo: '#FF9F45', outer: '#F7913F', mid: '#FFC266', core: '#FFF4D6', base: '#6C8CFF', glow: '#F7B267',
  paper: '#FFB85C', thread: '#E8B48A', rings: ['#3A3050', '#4A3B58', '#6A4A58'] };
const COOL = { halo: '#8C6CFF', outer: '#7A63F0', mid: '#9FB6FF', core: '#F0F2FF', base: '#D2B4FF', glow: '#9D7CF5',
  paper: '#A99BFF', thread: '#B6A6F5', rings: ['#2E2E58', '#3A3A6E', '#4E4A86'] };
let pulseIds = 0;
const MOTH_IDLE = '#E9DCF0', MOTH_CALL = '#7B5CFF', MOTH_SINGED = '#8C8494'; // singed: the turn ended in an API error

// A faint tint per project (from its folder name), nudged a little per session so two sessions in one repo still differ.
const hash = str => [...String(str)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
// Random-looking numbers that every window agrees on: seeded from a session's id, so the lantern in the toolbelt,
// the Dock app and the screensaver all put a moth in the same place (mulberry32).
const seeded = seed => () => {
  let t = seed = (seed + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
function tintFor(s) {
  const hue = (hash(s.cwd.split('/').filter(Boolean).pop()) % 360 + (hash(s.id) % 29) - 14 + 360) % 360;
  const l = 0.72, a = 0.55 * Math.min(l, 1 - l), f = n => { const k = (n + hue / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
// cheap smooth noise: a few sines at unrelated frequencies
const wobble = (s, k) => Math.sin(s * 2.3 + k) * 0.6 + Math.sin(s * 5.1 + k * 1.7) * 0.3 + Math.sin(s * 11.7 + k * 0.6) * 0.1;
