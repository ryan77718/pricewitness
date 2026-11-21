// Shows the most recent daily fingerprint lists on the methods page.
const box = document.getElementById("ledger");
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
try {
  const response = await fetch("/api/ledger", {cache: "no-store"});
  if (!response.ok) throw Error();
  const {days} = await response.json();
  box.innerHTML = days.length
    ? '<table><caption>Recent daily lists</caption><thead><tr><th scope="col">Day (UTC)</th><th scope="col">Reports</th><th scope="col">Root fingerprint</th></tr></thead><tbody>' +
      days.map(d => '<tr><td><a href="/api/ledger?day=' + escape(d.day) + '&amp;format=text">' + escape(d.day) + '</a>' + (d.complete ? "" : " <span class=\"planned\">in progress</span>") +
        '</td><td>' + escape(d.count) + '</td><td><code title="' + escape(d.root) + '">' + escape(d.root.slice(0, 16)) + '…</code></td></tr>').join("") + '</tbody></table>'
    : '<p class="muted">No reports have been fingerprinted yet.</p>';
} catch {
  box.innerHTML = '<p class="muted">The daily lists could not be loaded right now.</p>';
}
