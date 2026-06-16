(function () {
  // Validate the URL fragment against the exact invite format the app accepts
  // (parseInviteUrl): "v=1&g=<22 base64url>&t=<32 base64url>", keys v/g/t only.
  // Only then reflect it into the custom-scheme navigation; otherwise fall back
  // to the normal page so an attacker-controlled fragment can't drive the deep
  // link.
  var MAX_FRAGMENT_LENGTH = 512;
  var GROUP_ID_RE = /^[A-Za-z0-9_-]{22}$/;
  var INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

  function isValidInviteFragment(hash) {
    if (!hash || hash.length > MAX_FRAGMENT_LENGTH) return false;
    var params = { v: undefined, g: undefined, t: undefined };
    var pairs = hash.split('&');
    for (var i = 0; i < pairs.length; i++) {
      var parts = pairs[i].split('=');
      if (parts.length !== 2) return false;
      var key = parts[0];
      var value = parts[1];
      if (!key || !value) return false;
      if (key !== 'v' && key !== 'g' && key !== 't') return false;
      if (params[key] !== undefined) return false;
      params[key] = value;
    }
    return (
      params.v === '1' &&
      !!params.g &&
      GROUP_ID_RE.test(params.g) &&
      !!params.t &&
      INVITE_TOKEN_RE.test(params.t)
    );
  }

  var rawHash = window.location.hash || '';
  var hash = rawHash.charAt(0) === '#' ? rawHash.slice(1) : rawHash;

  if (!isValidInviteFragment(hash)) {
    // Not a valid invite link — leave the page as a normal fallback.
    return;
  }

  var target = 'baltic72://join#' + hash;
  var link = document.getElementById('open-link');
  var status = document.getElementById('open-status');
  if (link) link.setAttribute('href', target);
  if (status) status.textContent = 'Opening the invite in the Baltic72 app.';
  window.setTimeout(function () {
    window.location.href = target;
  }, 500);
})();
