(function () {
  const loaded_urls = new Set();

  function load_script_once(url) {
    if (loaded_urls.has(url)) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => {
        loaded_urls.add(url);
        resolve();
      };
      script.onerror = () => reject(new Error(`script_load_failed: ${url}`));
      document.head.appendChild(script);
    });
  }

  async function load_css_text(url) {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`css_load_failed: ${url} (${resp.status})`);
    return resp.text();
  }

  window.hse_loader = { load_script_once, load_css_text };
})();
