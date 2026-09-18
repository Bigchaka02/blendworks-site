/* Contact form -> POST /api/contact (worker/email.js sends it to the shop's inbox through Resend with reply-to = the
   sender). A hidden "website" field catches bots. Until the founder adds the Resend key the API answers 503 with the
   address to e-mail instead. */
(function () {
  const { $ } = BW;
  document.addEventListener("bw:ready", () => {
    const form = $("[data-contact-form]");
    if (!form) return;
    const err = $("[data-error]", form), btn = $("button[type=submit]", form);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) return form.reportValidity();
      err.hidden = true;
      btn.disabled = true;
      btn.textContent = "Sending…";
      const fd = new FormData(form);
      try {
        await BW.auth.contact({ name: fd.get("name"), email: fd.get("email"), topic: fd.get("topic"), message: fd.get("message"), website: fd.get("website") });
        const ok = $("[data-form-success]");
        $("[data-sent-to]").textContent = String(fd.get("email"));
        form.hidden = true;
        ok.classList.add("is-visible");
        BW.fx("pop", ok);
      } catch (x) {
        err.textContent = x.message;
        err.hidden = false;
        btn.disabled = false;
        btn.textContent = "Send message";
      }
    });
  });
})();
