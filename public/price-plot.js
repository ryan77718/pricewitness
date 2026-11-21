import {dayLabel} from "./data.js";

const numberFormat = new Intl.NumberFormat("en-US");
let nextPlotId = 0;

function moneyFormatter(currency) {
  let formatter;
  try {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency", currency, currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 0, maximumFractionDigits: 3
    });
  } catch {
    return moneyFormatter("USD");
  }
  const symbol = formatter.formatToParts(0).find(part => part.type === "currency").value;
  const precisionFormats = new Map([[0, formatter]]);
  const format = cents => {
    // Keep a half-cent median exact when two central reports differ by a cent.
    const decimals = !Number.isInteger(cents) ? 3 : cents % 100 ? 2 : 0;
    if (!precisionFormats.has(decimals)) {
      precisionFormats.set(decimals, new Intl.NumberFormat("en-US", {
        style: "currency", currency, currencyDisplay: "narrowSymbol",
        minimumFractionDigits: decimals, maximumFractionDigits: decimals
      }));
    }
    return precisionFormats.get(decimals).format(cents / 100);
  };
  return {symbol, format};
}

function readCents(raw, symbol) {
  let value = raw.trim();
  if (value.startsWith(symbol)) value = value.slice(symbol.length).trim();
  if (!/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{0,2})?|\.\d{1,2})$/.test(value)) return null;
  const [whole, fraction = ""] = value.replaceAll(",", "").split(".");
  const cents = Number(whole || 0) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function ticksFor({count, low, median, high, bins}) {
  if (low === high) return [{lo: low, hi: high, n: count}];
  if (count === 2) return [{lo: low, hi: low, n: 1}, {lo: high, hi: high, n: 1}];
  if (count === 3) {
    const amounts = new Map();
    for (const amount of [low, median, high]) amounts.set(amount, (amounts.get(amount) || 0) + 1);
    return [...amounts].map(([cents, n]) => ({lo: cents, hi: cents, n}));
  }
  return bins.filter(bin => Number.isFinite(bin.lo) && Number.isFinite(bin.hi) && bin.n >= 0)
    .sort((a, b) => a.lo - b.lo);
}

function textForBand(band, format) {
  const interval = band.lo === band.hi ? format(band.lo) : format(band.lo) + "–" + format(band.hi);
  return interval + " · " + numberFormat.format(band.n) + (band.n === 1 ? " sighting" : " sightings");
}

// Each occupied bin exposes its actual extrema. Interior prices can have an
// uncertain rank, but its minimum and maximum each account for at least one sighting.
export function cheaperCount(bands, cents) {
  let lower = 0, upper = 0;
  for (const band of bands) {
    const min = band.minSeen ?? band.lo, max = band.maxSeen ?? band.hi;
    if (cents > max) { lower += band.n; upper += band.n; }
    else if (cents > min) { lower += 1; upper += band.n - 1; }
  }
  return {lower, upper};
}

/**
 * Draw an aggregated price distribution. All amounts, including bin ends, are cents.
 * A bin's lo and hi are the lowest and highest cents in its closed interval.
 * Checking a quote is entirely local to this element.
 */
export function mountPricePlot(container, snapshot, onSelectBand) {
  const {currency = "USD", count = 0, low, median, high, bins = [], edges = [], examples = false} = snapshot;
  const root = makeElement("section", "pw-plot");
  const plotId = "price-plot-" + ++nextPlotId;
  root.setAttribute("aria-labelledby", plotId + "-title");
  const top = makeElement("div", "pw-plot__top");
  const title = makeElement("h3", "pw-plot__title sr", "Reported prices");
  title.id = plotId + "-title";
  top.append(title, makeElement("span", "pw-plot__count",
    numberFormat.format(count) + (examples ? " example" : "") + (count === 1 ? " sighting" : " sightings")));
  const evidence = makeElement("div","pw-plot__evidence");
  evidence.append(top);
  root.append(evidence);
  container.replaceChildren(root);
  if (!count || ![low, median, high].every(Number.isFinite) || high < low) {
    root.append(makeElement("p", "pw-plot__empty", "No prices in this selection."));
    return;
  }

  const {symbol, format} = moneyFormatter(currency);
  const ticks = ticksFor({count, low, median, high, bins});
  const pointMode = high === low || (count <= 8 && ticks.length > 0 && ticks.every(band => band.lo === band.hi));
  function position(amount) {
    if (low === high) return amount < low ? 0 : amount > high ? 100 : 50;
    return Math.max(0, Math.min(100, (amount - low) / (high - low) * 100));
  }
  const chart = makeElement("div", "pw-plot__chart" + (pointMode ? " pw-plot__chart--points" : ""));
  const topLabels = makeElement("div", "pw-plot__labels");
  const grid = makeElement("div", "pw-plot__grid");
  const stage = makeElement("div", "pw-plot__stage");
  stage.setAttribute("role", "group");
  stage.setAttribute("aria-label", "Price frequencies. Use the arrow keys to inspect prices and Enter to open their sightings.");
  if (!pointMode) {
    const peak = Math.max(1, ...ticks.map(bin => bin.n));
    const lines = makeElement("div", "pw-plot__guides");
    lines.setAttribute("aria-hidden", "true");
    lines.append(makeElement("i"), makeElement("i"), makeElement("i"));
    grid.append(lines);
    const maxLabel = makeElement("span", "pw-plot__peak", numberFormat.format(peak)+(peak===1?" sighting":" sightings"));
    maxLabel.title = "Tallest bar: " + numberFormat.format(peak) + " reports";
    lines.firstElementChild.append(maxLabel);
  }

  const medianName = count === 1 || low === high ? "Reported price" : "Median";
  const annotation = makeElement("div", "pw-plot__annotation");
  const annotationText = makeElement("span");
  annotation.append(annotationText);
  topLabels.append(annotation);
  const reference = makeElement("div", "pw-plot__reference");
  reference.setAttribute("aria-hidden", "true");
  reference.style.left = position(median) + "%";
  grid.append(stage, reference);
  const quoteLine = makeElement("div", "pw-plot__quote-line");
  quoteLine.hidden = true;
  quoteLine.setAttribute("aria-hidden", "true");
  grid.append(quoteLine);

  const axes = makeElement("div", "pw-plot__axes");
  if (high !== low) {
    for (const [name, value] of [["Low", low], ["High", high]]) {
      const label = makeElement("span", "pw-plot__axis");
      label.append(makeElement("small", "", name), makeElement("b", "", format(value)));
      axes.append(label);
    }
    if (onSelectBand) {
      axes.insertBefore(makeElement("span","pw-plot__hint",pointMode ? "Select a dot for sightings" : "Select a bar for sightings"),axes.lastElementChild);
    }
  } else {
    axes.append(makeElement("span", "pw-plot__equal", count === 1
      ? "One report so far" : "All reports recorded the same price"));
  }
  const slider = makeElement("input", "pw-plot__slider");
  slider.type = "range";
  slider.min = String(low);
  slider.max = String(high);
  slider.step = "1";
  slider.value = String(Math.round(median));
  slider.setAttribute("aria-label", "Try a price in " + currency);
  slider.setAttribute("aria-valuetext", format(Number(slider.value)));
  const track = makeElement("div", "pw-plot__track");
  if (high > low) track.append(slider);
  chart.append(topLabels, grid, track, axes);
  evidence.append(chart);
  const pair = makeElement("div","pw-plot__pair");
  pair.hidden = true;
  if (edges.length) {
    for (const [index, report] of edges.entries()) {
      const receipt = makeElement(onSelectBand ? "button" : "div","pw-plot__receipt");
      if (onSelectBand) {
        receipt.type="button";
        receipt.addEventListener("click",()=>onSelectBand({lo:report.cents,hi:report.cents}));
      }
      const label = edges.length === 1 ? "Reported price" : index === 0 ? "Lowest sighting" : "Highest sighting";
      receipt.append(makeElement("span","receipt-label",label),makeElement("strong","",format(report.cents)),
        makeElement("span","receipt-context",report.context),makeElement("small","",dayLabel(report.seen)));
      pair.append(receipt);
    }
  }
  evidence.append(pair);
  const switcher = makeElement("div","pw-plot__switch");
  switcher.setAttribute("role","group");
  switcher.setAttribute("aria-label","Comparison view");
  top.insertBefore(switcher,title.nextSibling);
  const modes = edges.length ? ["Distribution","Low & high"] : ["Distribution"];
  for (const [index,name] of modes.entries()) {
    const control = makeElement("button","",name);
    control.type = "button";
    control.setAttribute("aria-pressed",String(index===0));
    if (index===1 && edges.length===1) control.textContent="Sighting";
    control.addEventListener("click",()=>{
      chart.hidden = index===1;
      pair.hidden = index===0;
      label.textContent = index===0 && high>low ? "Slide or enter your price" : "Enter your price";
      for (const item of switcher.children) item.setAttribute("aria-pressed",String(item===control));
    });
    switcher.append(control);
  }

  let activeBand = null;
  let privateQuote = null;
  const buttons = [];
  const peak = Math.max(1, ...ticks.map(bin => bin.n));
  function annotate(percent, text, kind = "median") {
    annotation.dataset.position = percent < 22 ? "start" : percent > 78 ? "end" : "center";
    annotation.style.left = percent + "%";
    annotation.dataset.kind = kind;
    annotationText.textContent = text;
  }
  function updateAnnotation() {
    for (const {button,band} of buttons) {
      button.classList.toggle("is-highlighted", band === activeBand);
      button.classList.toggle("below-quote", privateQuote !== null && (band.maxSeen ?? band.hi) < privateQuote);
    }
    if (activeBand) {
      const pos = position((activeBand.lo + activeBand.hi) / 2);
      annotate(pos, textForBand(activeBand, format), "band");
    } else if (privateQuote !== null) {
      annotate(position(privateQuote), "Your price " + format(privateQuote), "quote");
    } else {
      annotate(position(median), medianName + " " + format(median));
    }
  }

  for (const [index, band] of ticks.entries()) {
    if (!band.n) continue;
    const button = makeElement("button", "pw-plot__bin");
    button.type = "button";
    button.tabIndex = -1;
    button.setAttribute("aria-label", textForBand(band, format));
    const mark = makeElement("span", "pw-plot__mark");
    mark.setAttribute("aria-hidden", "true");
    if (pointMode) {
      button.style.left = position(band.lo) + "%";
      const dots = count <= 8 ? band.n : 1;
      for (let dot = 0; dot < dots; dot++) mark.append(makeElement("i"));
    } else {
      // Use the data's continuous price axis, including gaps between reported bins.
      const left = position(band.lo);
      const next = ticks[index + 1];
      const rightEdge = next?.lo - band.hi <= 1 ? next.lo : band.hi + 1;
      const width = Math.max(0.2, Math.min(100 - left, position(rightEdge) - left));
      button.style.left = left + "%";
      button.style.width = width + "%";
      mark.style.height = (band.n / peak * 100) + "%";
    }
    button.append(mark);
    const activate = () => {
      activeBand = band;
      for (const item of buttons) item.button.tabIndex = item.button === button ? 0 : -1;
      updateAnnotation();
    };
    button.addEventListener("pointerenter", event => {
      if (event.pointerType !== "touch") activate();
    });
    button.addEventListener("focus", activate);
    button.addEventListener("click", () => {activate();onSelectBand?.(band)});
    stage.append(button);
    buttons.push({button, band});
  }
  if (buttons.length) {
    const closest = buttons.reduce((best, entry) => {
      const distance = b => Math.abs((b.lo + b.hi) / 2 - median);
      return distance(entry.band) < distance(best.band) ? entry : best;
    });
    closest.button.tabIndex = 0;
  }
  if (pointMode && count <= 8) grid.style.height = Math.max(32, peak * 10 + 6) + "px";

  stage.addEventListener("keydown", event => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    const index = buttons.findIndex(entry => entry.button === event.target);
    if (index < 0 || !keys.includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1)));
    buttons[next].button.focus();
  });
  const endInspect = () => {activeBand = null; updateAnnotation()};
  stage.addEventListener("pointerleave", () => {
    if (!stage.contains(document.activeElement)) endInspect();
  });
  stage.addEventListener("focusout", event => {
    if (!stage.contains(event.relatedTarget)) endInspect();
  });
  updateAnnotation();

  const form = makeElement("form", "pw-plot__check");
  form.noValidate = true;
  const label = makeElement("label", "pw-plot__check-label", high>low ? "Slide or enter your price" : "Check your price");
  label.title = "This private check stays on your device.";
  label.htmlFor = plotId + "-input";
  const control = makeElement("div", "pw-plot__control");
  const prefix = makeElement("span", "pw-plot__prefix", symbol);
  prefix.setAttribute("aria-hidden", "true");
  const input = makeElement("input", "pw-plot__input");
  input.id = label.htmlFor;
  input.type = "text";
  input.inputMode = "decimal";
  input.placeholder = "0.00";
  input.autocomplete = "off";
  input.maxLength = 22;
  input.setAttribute("aria-label", "Your private price in " + currency);
  const check = makeElement("button", "pw-plot__submit");
  check.type = "submit";
  check.setAttribute("aria-label", "Check price");
  
  check.textContent = "Check price";
  control.append(prefix, input, check);
  const privacy = makeElement("p","pw-plot__privacy","Only visible to you");
  form.append(label,control,privacy);
  const result = makeElement("p", "pw-plot__result");
  result.setAttribute("role", "status");
  result.setAttribute("aria-live", "polite");
  result.id = plotId + "-result";
  input.setAttribute("aria-describedby", result.id);
  form.append(result);
  root.append(form);

  function clearQuote() {
    privateQuote = null;
    slider.value=String(Math.round(median));
    slider.setAttribute("aria-valuetext",format(Number(slider.value)));
    activeBand = null;
    quoteLine.hidden = true;
    result.replaceChildren();
    delete result.dataset.error;
    input.removeAttribute("aria-invalid");
    updateAnnotation();
  }

  function applyQuote(cents) {
    privateQuote = cents;
    slider.value=String(cents);
    slider.setAttribute("aria-valuetext",format(Number(slider.value)));
    activeBand = null;
    const boundary = cents < low ? "below" : cents > high ? "above" : "";
    quoteLine.dataset.boundary = boundary;
    quoteLine.hidden = false;
    quoteLine.style.left = position(cents) + "%";
    const difference = cents - median;
    const relative = difference === 0 ? "matches" : difference > 0 ? "above" : "below";
    const target = count === 1 || high === low ? "reported price" : "median";
    const verdict = difference === 0 ? "Matches the " + target : format(Math.abs(difference)) + " " + relative + " the " + target;
    const {lower,upper} = cheaperCount(ticks,cents);
    let context;
    if (count===1) context = "Based on one sighting.";
    else if (low===high) context = "All " + numberFormat.format(count) + " sightings were " + format(low) + ".";
    else if (cents < low) context = "Below every reported price.";
    else if (cents > high) context = "Above every reported price.";
    else if (cents === low) context = "Matches the lowest sighting.";
    else if (cents === high) context = "Matches the highest sighting.";
    else context = (lower===upper ? "" : "At least ") + numberFormat.format(lower) + " of " + numberFormat.format(count) + " sightings were lower.";
    result.replaceChildren(makeElement("strong","",verdict + "."),document.createTextNode(" " + context));
    input.removeAttribute("aria-invalid");
    delete result.dataset.error;
    updateAnnotation();
  }
  slider.addEventListener("input", () => {
    const cents = Number(slider.value);
    input.value = (cents/100).toFixed(2);
    applyQuote(cents);
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const cents = readCents(input.value, symbol);
    if (cents === null) {
      clearQuote();
      input.setAttribute("aria-invalid", "true");
      result.dataset.error = "true";
      result.textContent = "Enter a price of zero or more, using up to two decimal places.";
      input.focus();
      return;
    }
    applyQuote(cents);
  });
  input.addEventListener("input", () => {
    if (!input.value.trim()) return clearQuote();
    const cents = readCents(input.value, symbol);
    if (privateQuote !== null && cents !== null) applyQuote(cents);
    else if (privateQuote !== null || input.hasAttribute("aria-invalid")) clearQuote();
  });
}

