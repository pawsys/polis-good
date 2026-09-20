// Span embed. Usage:
//   <div data-span-poll="POLL_ID"></div>
//   <script async src="https://YOUR-SPAN-HOST/embed.js"></script>
(function () {
  var script = document.currentScript || document.querySelector('script[src*="/embed.js"]');
  var origin = new URL(script.src, location.href).origin;
  var frames = {};

  function mount(node) {
    var id = node.getAttribute('data-span-poll');
    if (!id || node.getAttribute('data-span-mounted')) return;
    node.setAttribute('data-span-mounted', '1');
    var frame = document.createElement('iframe');
    frame.src = origin + '/embed/' + encodeURIComponent(id);
    frame.title = 'Span poll';
    frame.loading = 'lazy';
    frame.style.cssText = 'width:100%;border:0;display:block;min-height:520px;color-scheme:light';
    node.appendChild(frame);
    frames[id] = frame;
  }

  window.addEventListener('message', function (ev) {
    if (ev.origin !== origin || !ev.data || ev.data.type !== 'span:height') return;
    var frame = frames[ev.data.poll];
    if (frame && ev.source === frame.contentWindow) frame.style.height = Math.ceil(ev.data.height) + 'px';
  });

  function scan() { Array.prototype.forEach.call(document.querySelectorAll('[data-span-poll]'), mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
})();
