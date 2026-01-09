// mathjax-inject.js
// Runs in the page context to extract LaTeX from MathJax v3/v4.
// Posts messages back to the content script.
// No persistent storage.

(() => {
    const mj = window.MathJax;
    const mjVersion = mj && typeof mj.version === 'string' ? mj.version : '';
  
    // Only support MathJax v3/v4
    if (!mj || !mjVersion || (!mjVersion.startsWith('3') && !mjVersion.startsWith('4'))) {
      return;
    }
  
    function getMathList() {
      const doc = window.MathJax?.startup?.document;
      return doc?.math?.list || null;
    }
  
    function extractLatexFromContainer(mjxContainer) {
      const list = getMathList();
      if (!list) return null;
  
      // MathJax math list is a linked list (circular). Iterate safely.
      let node = list;
      const visited = new Set();
  
      while (node && node.data && !visited.has(node)) {
        visited.add(node);
        const item = node.data;
  
        // Prefer node identity/containment checks over innerHTML comparisons.
        const root = item?.typesetRoot;
        const matches =
          root === mjxContainer ||
          (root && typeof root.contains === 'function' && root.contains(mjxContainer)) ||
          (mjxContainer && typeof mjxContainer.contains === 'function' && mjxContainer.contains(root));
  
        if (matches) {
          const latex = item?.math;
          if (typeof latex === 'string' && latex.trim()) {
            return latex.trim();
          }
        }
  
        node = node.next;
      }
  
      return null;
    }
  
    function postLatex(mjx) {
      const latex = extractLatexFromContainer(mjx);
      if (!latex) return;
  
      window.postMessage(
        {
          type: 'HoverLatex_MathJaxV3', // keep contract the same for your content.js
          latex,
          mjxId: mjx.getAttribute('ctxtmenu_counter')
        },
        '*'
      );
    }
  
    function handleEvent(evt) {
      const mjx = evt.target?.closest?.('mjx-container');
      if (mjx) postLatex(mjx);
    }
  
    // Capture phase so we run even if the page stops propagation.
    document.addEventListener('mouseover', handleEvent, true);
    document.addEventListener('click', handleEvent, true);
  })();