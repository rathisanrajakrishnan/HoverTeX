// HoverTeX content script
// Copy LaTeX from KaTeX, MathJax (v2 + v3), and Wikipedia math images.

(() => {
    // -----------------------------
    // MathJax v3 injection + bridge
    // -----------------------------
    let mj3LatexCache = null;
  
    function injectMJ3Script() {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL('mathjax-inject.js');
      s.onload = function () {
        console.log('[HoverTeX] Injected mathjax-inject.js');
        this.remove();
      };
      document.documentElement.appendChild(s);
    }
  
    injectMJ3Script();
  
    window.addEventListener('message', (evt) => {
      if (evt.source !== window) return;
      const payload = evt.data;
      if (payload && payload.type === 'HoverLatex_MathJaxV3') {
        // keeping the same message type so your injected script doesn't need changes
        mj3LatexCache = payload.latex;
      }
    });
  
    // -----------------------------
    // Overlay UI
    // -----------------------------
    let tooltipEl = null;
    let hoveredNode = null;
  
    function ensureTooltip() {
      if (tooltipEl) return;
  
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'hoverlatex-overlay';
      tooltipEl.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
             viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4
                   a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span>Click to copy</span>
      `;
      document.body.appendChild(tooltipEl);
    }
  
    function setTooltipText(text) {
      if (!tooltipEl) return;
      const span = tooltipEl.querySelector('span');
      if (span) span.textContent = text;
    }
  
    function placeTooltip(anchor) {
      const r = anchor.getBoundingClientRect();
      // Make sure it's measurable before positioning (in case CSS uses visibility)
      const width = tooltipEl.offsetWidth;
      const height = tooltipEl.offsetHeight;
  
      const top = r.top + window.scrollY - height - 8;
      const left = r.left + window.scrollX + (r.width / 2) - (width / 2);
  
      tooltipEl.style.top = `${top}px`;
      tooltipEl.style.left = `${left}px`;
    }
  
    function openTooltip(anchor, latex) {
      ensureTooltip();
      tooltipEl.dataset.tex = latex;
      setTooltipText('Click to copy');
      tooltipEl.classList.remove('copied');
      placeTooltip(anchor);
      tooltipEl.classList.add('visible');
    }
  
    function closeTooltip() {
      if (tooltipEl) tooltipEl.classList.remove('visible');
    }
  
    async function copyToClipboard(latex) {
      try {
        await navigator.clipboard.writeText(latex);
        tooltipEl?.classList.add('copied');
        setTooltipText('Copied! ✅');
        setTimeout(() => {
          tooltipEl?.classList.remove('copied');
          setTooltipText('Click to copy');
        }, 1500);
      } catch (err) {
        console.error('[HoverTeX] Clipboard error:', err);
      }
    }
  
    // -----------------------------
    // Site / element detection
    // -----------------------------
    function onWikiFamilyHost() {
      const host = window.location.hostname;
      return (
        host.endsWith('.wikipedia.org') ||
        host === 'www.wikiwand.com' ||
        host === 'wikimedia.org' ||
        host.endsWith('.wikiversity.org') ||
        host.endsWith('.wikibooks.org')
      );
    }
  
    function extractWikiImageLatex(node) {
      if (!onWikiFamilyHost()) return null;
      if (!node || node.tagName !== 'IMG') return null;
  
      const isMathImg =
        node.classList.contains('mwe-math') ||
        node.classList.contains('mwe-math-fallback-image-inline') ||
        node.classList.contains('mwe-math-fallback-image-display');
  
      if (!isMathImg) return null;
  
      const alt = node.getAttribute('alt');
      if (!alt || !alt.trim()) return null;
  
      const raw = alt.trim();
      const displayStyleMatch = raw.match(/^\{\\displaystyle\s*([\s\S]*?)\}$/);
      return (displayStyleMatch ? displayStyleMatch[1] : raw).trim();
    }
  
    function extractKatexLatex(fromNode) {
      const container = fromNode.closest?.('.katex');
      if (!container) return null;
  
      const ann = container.querySelector(
        '.katex-mathml annotation[encoding="application/x-tex"]'
      );
      if (ann && ann.textContent && ann.textContent.trim()) {
        return ann.textContent.trim();
      }
  
      const fallback =
        container.getAttribute('data-tex') ||
        container.getAttribute('data-latex') ||
        container.getAttribute('aria-label');
  
      return fallback && fallback.trim() ? fallback.trim() : null;
    }
  
    function extractMJ3Latex(fromNode) {
      const mjx = fromNode.closest?.('mjx-container');
      if (!mjx) return null;
  
      // primary: last latex received from injected page bridge
      if (mj3LatexCache && String(mj3LatexCache).trim()) return String(mj3LatexCache).trim();
  
      // fallback: look ahead for math/tex scripts
      let probe = mjx;
      for (let i = 0; i < 5; i++) {
        probe = probe?.nextElementSibling;
        if (!probe) break;
        if (
          probe.tagName === 'SCRIPT' &&
          (probe.type === 'math/tex' || probe.type === 'math/tex; mode=display')
        ) {
          return (probe.textContent || '').trim() || null;
        }
      }
      return null;
    }
  
    function extractMJ2Latex(fromNode) {
      // display mode containers
      const display = fromNode.closest?.('.MathJax_Display, .MJXc-display');
      if (display) {
        let sib = display.nextElementSibling;
        while (sib) {
          if (sib.tagName === 'SCRIPT' && sib.type === 'math/tex; mode=display') {
            return (sib.textContent || '').trim() || null;
          }
          sib = sib.nextElementSibling;
        }
      }
  
      // inline mode containers
      const inline = fromNode.closest?.('.MathJax, .mjx-chtml, .MathJax_CHTML, .MathJax_MathML');
      if (!inline) return null;
  
      // classic MathJax span with id
      if (inline.id && inline.id.includes('MathJax-Element-')) {
        let sib = inline.nextElementSibling;
        while (sib) {
          if (sib.tagName === 'SCRIPT' && sib.type === 'math/tex') {
            return (sib.textContent || '').trim() || null;
          }
          sib = sib.nextElementSibling;
        }
      }
  
      // newer renderers sometimes keep scripts nearby too
      let sib = inline.nextElementSibling;
      while (sib) {
        if (
          sib.tagName === 'SCRIPT' &&
          (sib.type === 'math/tex' || sib.type === 'math/tex; mode=display')
        ) {
          return (sib.textContent || '').trim() || null;
        }
        sib = sib.nextElementSibling;
      }
  
      return null;
    }
  
    function findLatexForNode(node) {
      // priority order matches your original behavior
      const wiki = extractWikiImageLatex(node);
      if (wiki) return { anchor: node, latex: wiki };
  
      const katexLatex = extractKatexLatex(node);
      if (katexLatex) return { anchor: node.closest('.katex'), latex: katexLatex };
  
      const mj3Latex = extractMJ3Latex(node);
      if (mj3Latex) return { anchor: node.closest('mjx-container'), latex: mj3Latex };
  
      const mj2Latex = extractMJ2Latex(node);
      if (mj2Latex) {
        const anchor =
          node.closest('.MathJax_Display, .MJXc-display') ||
          node.closest('.MathJax, .mjx-chtml, .MathJax_CHTML, .MathJax_MathML');
        return { anchor, latex: mj2Latex };
      }
  
      return null;
    }
  
    function isMathRelatedNode(node) {
      if (!node) return false;
  
      if (node.closest?.('.katex')) return true;
      if (node.closest?.('mjx-container')) return true;
      if (node.closest?.('.MathJax_Display, .MJXc-display')) return true;
      if (node.closest?.('.MathJax, .mjx-chtml, .MathJax_CHTML, .MathJax_MathML')) return true;
  
      if (onWikiFamilyHost() && node.tagName === 'IMG') {
        return (
          node.classList.contains('mwe-math') ||
          node.classList.contains('mwe-math-fallback-image-inline') ||
          node.classList.contains('mwe-math-fallback-image-display')
        );
      }
      return false;
    }
  
    // -----------------------------
    // Event handlers
    // -----------------------------
    document.addEventListener('mouseover', (evt) => {
      const hit = findLatexForNode(evt.target);
      if (!hit || !hit.anchor) return;
  
      hoveredNode = hit.anchor;
      hoveredNode.classList.add('hoverlatex-hover');
      openTooltip(hoveredNode, hit.latex);
    });
  
    document.addEventListener('mouseout', (evt) => {
      if (!hoveredNode) return;
  
      // If mouse is still within a relevant math node, do nothing
      const next = evt.relatedTarget;
      if (next && isMathRelatedNode(next)) return;
  
      hoveredNode.classList.remove('hoverlatex-hover');
      hoveredNode = null;
      closeTooltip();
    });
  
    document.addEventListener('click', (evt) => {
      const hit = findLatexForNode(evt.target);
      if (!hit) return;
      copyToClipboard(hit.latex);
    });
  })();