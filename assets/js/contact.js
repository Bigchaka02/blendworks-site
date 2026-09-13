/* Contact form — PLACEHOLDER: simulates a submit; nothing is sent. TODO(contact): wire to a form/email service (Q16). */
(function () {
  const { $ } = BW;
  document.addEventListener("bw:ready", () => {
    const form = $("[data-contact-form]");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!form.checkValidity()) return form.reportValidity();
      const btn = $("button[type=submit]", form);
      btn.disabled = true;
      btn.textContent = "Sending…";
      setTimeout(() => {
        const ok = $("[data-form-success]");
        form.hidden = true;
        ok.classList.add("is-visible");
        BW.fx("pop", ok);
      }, 700);
    });
  });
})();
