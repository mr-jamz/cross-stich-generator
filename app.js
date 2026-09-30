const imageInput = document.querySelector('#imageInput');
const dropZone = document.querySelector('#dropZone');
const stitchWidth = document.querySelector('#stitchWidth');
const colorCount = document.querySelector('#colorCount');
const showSymbols = document.querySelector('#showSymbols');
const canvas = document.querySelector('#patternCanvas');
const ctx = canvas.getContext('2d');
const emptyState = document.querySelector('#emptyState');
const canvasWrap = document.querySelector('#canvasWrap');
const legendSection = document.querySelector('#legendSection');
const legend = document.querySelector('#legend');
const patternTitle = document.querySelector('#patternTitle');
const imageMeta = document.querySelector('#imageMeta');
const downloadButton = document.querySelector('#downloadButton');
const printButton = document.querySelector('#printButton');

const symbols = '●×■▲◆○+◇□△#%@&★♠♣♥!?:;=';
let sourceImage = null;
let sourceName = '';
let renderTimer;

stitchWidth.addEventListener('input', () => {
  document.querySelector('#stitchWidthOutput').value = `${stitchWidth.value} stitches`;
  queueRender();
});
colorCount.addEventListener('input', () => {
  document.querySelector('#colorCountOutput').value = `${colorCount.value} colors`;
  queueRender();
});
showSymbols.addEventListener('change', queueRender);
dropZone.addEventListener('click', () => imageInput.click());
dropZone.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); imageInput.click(); }
});
imageInput.addEventListener('change', () => loadFile(imageInput.files[0]));
['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, event => {
  event.preventDefault(); dropZone.classList.add('is-dragging');
}));
['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, event => {
  event.preventDefault(); dropZone.classList.remove('is-dragging');
}));
dropZone.addEventListener('drop', event => loadFile(event.dataTransfer.files[0]));
printButton.addEventListener('click', () => window.print());
downloadButton.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `${sourceName.replace(/\.[^.]+$/, '') || 'pattern'}-cross-stitch.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
});

function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    if (sourceImage?.objectUrl) URL.revokeObjectURL(sourceImage.objectUrl);
    image.objectUrl = url;
    sourceImage = image;
    sourceName = file.name;
    imageMeta.hidden = false;
    imageMeta.textContent = `${file.name} · ${image.naturalWidth} × ${image.naturalHeight}px`;
    renderPattern();
  };
  image.onerror = () => URL.revokeObjectURL(url);
  image.src = url;
}

function queueRender() {
  if (!sourceImage) return;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPattern, 100);
}

function renderPattern() {
  const width = Number(stitchWidth.value);
  const height = Math.max(1, Math.round(width * sourceImage.naturalHeight / sourceImage.naturalWidth));
  const sample = document.createElement('canvas');
  sample.width = width;
  sample.height = height;
  const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
  sampleCtx.drawImage(sourceImage, 0, 0, width, height);
  const imageData = sampleCtx.getImageData(0, 0, width, height);
  const palette = buildPalette(imageData.data, Number(colorCount.value));
  const mapped = mapPixels(imageData.data, palette);
  drawPattern(mapped, palette, width, height);
  drawLegend(palette, mapped, width * height);

  emptyState.hidden = true;
  canvasWrap.hidden = false;
  legendSection.hidden = false;
  downloadButton.disabled = false;
  printButton.disabled = false;
  patternTitle.textContent = `${width} × ${height} stitch pattern`;
}

function buildPalette(data, target) {
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 80) continue;
    const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
    const entry = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    entry.r += data[i]; entry.g += data[i + 1]; entry.b += data[i + 2]; entry.count++;
    buckets.set(key, entry);
  }
  let colors = [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, Math.max(target * 5, target));
  if (!colors.length) colors = [{ r: 255, g: 255, b: 255, count: 1 }];
  colors = colors.map(c => ({ r: c.r / c.count, g: c.g / c.count, b: c.b / c.count, weight: c.count }));
  const centers = [colors[0]];
  while (centers.length < Math.min(target, colors.length)) {
    let best = colors[0], bestScore = -1;
    for (const color of colors) {
      const distance = Math.min(...centers.map(center => colorDistance(color, center)));
      const score = distance * Math.sqrt(color.weight);
      if (score > bestScore) { best = color; bestScore = score; }
    }
    centers.push(best);
  }
  return centers.map(c => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) }));
}

function mapPixels(data, palette) {
  const mapped = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 80) { mapped.push(-1); continue; }
    let match = 0, distance = Infinity;
    for (let p = 0; p < palette.length; p++) {
      const current = colorDistance({ r: data[i], g: data[i + 1], b: data[i + 2] }, palette[p]);
      if (current < distance) { match = p; distance = current; }
    }
    mapped.push(match);
  }
  return mapped;
}

function colorDistance(a, b) {
  const redMean = (a.r + b.r) / 2;
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  return (2 + redMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - redMean) / 256) * db * db;
}

function drawPattern(mapped, palette, width, height) {
  const cell = width > 90 ? 12 : width > 60 ? 16 : 20;
  canvas.width = width * cell + 1;
  canvas.height = height * cell + 1;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${Math.max(8, cell * .53)}px Arial`;

  mapped.forEach((paletteIndex, index) => {
    if (paletteIndex < 0) return;
    const x = (index % width) * cell, y = Math.floor(index / width) * cell;
    const color = palette[paletteIndex];
    ctx.fillStyle = rgb(color); ctx.fillRect(x, y, cell, cell);
    if (showSymbols.checked) {
      ctx.fillStyle = luminance(color) > 145 ? '#17201f' : '#fff';
      ctx.fillText(symbols[paletteIndex] || String(paletteIndex + 1), x + cell / 2, y + cell / 2 + .5);
    }
  });

  for (let x = 0; x <= width; x++) {
    ctx.beginPath(); ctx.strokeStyle = x % 10 === 0 ? '#17201f' : 'rgba(23,32,31,.28)'; ctx.lineWidth = x % 10 === 0 ? 1.5 : .5;
    ctx.moveTo(x * cell + .5, 0); ctx.lineTo(x * cell + .5, height * cell); ctx.stroke();
  }
  for (let y = 0; y <= height; y++) {
    ctx.beginPath(); ctx.strokeStyle = y % 10 === 0 ? '#17201f' : 'rgba(23,32,31,.28)'; ctx.lineWidth = y % 10 === 0 ? 1.5 : .5;
    ctx.moveTo(0, y * cell + .5); ctx.lineTo(width * cell, y * cell + .5); ctx.stroke();
  }
}

function drawLegend(palette, mapped, total) {
  const counts = new Array(palette.length).fill(0);
  mapped.forEach(index => { if (index >= 0) counts[index]++; });
  legend.replaceChildren(...palette.map((color, index) => {
    const item = document.createElement('div'); item.className = 'legend-item';
    const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.background = rgb(color);
    swatch.style.color = luminance(color) > 145 ? '#17201f' : '#fff'; swatch.textContent = symbols[index] || index + 1;
    const code = document.createElement('span'); code.innerHTML = `<strong>Color ${index + 1}</strong><br><span class="color-code">${hex(color)}</span>`;
    const count = document.createElement('span'); count.className = 'stitch-count'; count.textContent = `${counts[index].toLocaleString()} sts`;
    item.append(swatch, code, count); return item;
  }));
  document.querySelector('#stitchSummary').textContent = `${total.toLocaleString()} total stitches · ${palette.length} colors`;
}

const rgb = color => `rgb(${color.r}, ${color.g}, ${color.b})`;
const hex = color => `#${[color.r, color.g, color.b].map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const luminance = color => .299 * color.r + .587 * color.g + .114 * color.b;
