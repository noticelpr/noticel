// In-page confirmation boxes in the site's own design, instead of the browser's gray confirm()/prompt() pop-ups.
// ask('¿Borrar esta tarea?', { ok: 'Borrar', danger: true }) → Promise<boolean>
// askText('¿Qué debe corregir el periodista?', { value: '' }) → Promise<string | null> (null = canceled)
// Styles: .nc-ask in src/styles/global.css.

type Opts = { ok?: string; cancel?: string; danger?: boolean; value?: string; placeholder?: string; multiline?: boolean };

function open(message: string, o: Opts, withText: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'nc-ask';
    d.setAttribute('aria-label', message);
    const field = withText
      ? o.multiline || (o.value ?? '').length > 60
        ? '<textarea class="nc-ask-in" rows="4"></textarea>'
        : '<input class="nc-ask-in" type="text" />'
      : '';
    d.innerHTML = `<form method="dialog"><p class="nc-ask-msg"></p>${field}
      <div class="nc-ask-btns"><button type="button" class="nc-ask-no"></button><button type="submit" class="nc-ask-ok${o.danger ? ' danger' : ''}"></button></div></form>`;
    d.querySelector('.nc-ask-msg')!.textContent = message;
    d.querySelector('.nc-ask-no')!.textContent = o.cancel ?? 'Cancelar';
    d.querySelector('.nc-ask-ok')!.textContent = o.ok ?? (withText ? 'Guardar' : 'Sí, seguir');
    const input = d.querySelector<HTMLInputElement | HTMLTextAreaElement>('.nc-ask-in');
    if (input) { input.value = o.value ?? ''; input.placeholder = o.placeholder ?? ''; }
    // Answer right away on each action (the dialog's own "close" event is held back in background tabs)
    let done = false;
    const finish = (answer: string | null) => { if (done) return; done = true; if (d.open) d.close(); d.remove(); resolve(answer); };
    d.querySelector('form')!.addEventListener('submit', (e) => { e.preventDefault(); finish(input ? input.value : 'ok'); });
    d.querySelector('.nc-ask-no')!.addEventListener('click', () => finish(null));
    d.addEventListener('click', (e) => { if (e.target === d) finish(null); }); // click outside the box = cancel
    d.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); }); // Esc key
    d.addEventListener('close', () => finish(null));
    document.body.append(d);
    d.showModal();
    (input ?? d.querySelector<HTMLButtonElement>('.nc-ask-ok'))!.focus();
  });
}

/** Yes/no question inside the page. Resolves true when the person confirms. */
export const ask = (message: string, o: Opts = {}) => open(message, o, false).then((a) => a !== null);
/** Question with a text box inside the page. Resolves the text, or null when canceled. */
export const askText = (message: string, o: Opts = {}) => open(message, o, true);
