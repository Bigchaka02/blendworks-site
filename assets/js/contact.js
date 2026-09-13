/* Contact form — PLACEHOLDER: simulates a submit; nothing is sent. TODO(contact): wire to a form/email service. */
(function () {
  var $ = BW.$;
  document.addEventListener("bw:ready", function () {
    var form = $("[data-contact-form]"); if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) return form.reportValidity();
      var btn = $("button[type=submit]", form); btn.disabled = true; btn.textContent = "Sending…";
      setTimeout(function () {
        var ok = $("[data-form-success]"); form.hidden = true; ok.classList.add("is-visible"); BW.fx("pop", ok);
        BW.toast("Message received (placeholder — not actually sent yet).");
      }, 700);
    });
  });
})();
