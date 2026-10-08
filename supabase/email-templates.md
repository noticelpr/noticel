# Correos de las cuentas, en español

Pégalos en **Supabase → Authentication → Emails → Templates**.
En cada plantilla, copia el **Asunto** (Subject) y el **Mensaje** (el cuadro del cuerpo, que acepta HTML).
No cambies lo que está entre `{{ }}`: Supabase lo reemplaza por el enlace de cada persona.

---

## Confirm signup (Confirmar cuenta)

**Asunto:**
```
Confirma tu cuenta de NotiCel
```

**Mensaje:**
```html
<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#16161D">
  <h2 style="color:#2B1185">¡Bienvenido a NotiCel!</h2>
  <p>Toca el botón para confirmar tu correo y activar tu cuenta:</p>
  <p><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#2B1185;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Confirmar mi cuenta</a></p>
  <p style="color:#5C5F6E;font-size:13px">Si no creaste una cuenta en NotiCel, ignora este correo.</p>
</div>
```

---

## Reset password (Cambiar contraseña)

**Asunto:**
```
Crea tu contraseña nueva de NotiCel
```

**Mensaje:**
```html
<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#16161D">
  <h2 style="color:#2B1185">¿Olvidaste tu contraseña?</h2>
  <p>Toca el botón para crear una contraseña nueva. El enlace vence en 1 hora.</p>
  <p><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#2B1185;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Crear contraseña nueva</a></p>
  <p style="color:#5C5F6E;font-size:13px">Si no pediste este cambio, ignora este correo: tu contraseña sigue igual.</p>
</div>
```

---

## Change email address (Cambiar correo)

**Asunto:**
```
Confirma tu correo nuevo en NotiCel
```

**Mensaje:**
```html
<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#16161D">
  <h2 style="color:#2B1185">Confirma tu correo nuevo</h2>
  <p>Pediste cambiar el correo de tu cuenta de <b>{{ .Email }}</b> a <b>{{ .NewEmail }}</b>.</p>
  <p><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#2B1185;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Confirmar el cambio</a></p>
  <p style="color:#5C5F6E;font-size:13px">Si no pediste este cambio, ignora este correo.</p>
</div>
```

---

## Magic link (Entrar con un enlace) — por si se usa más adelante

**Asunto:**
```
Tu enlace para entrar a NotiCel
```

**Mensaje:**
```html
<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#16161D">
  <h2 style="color:#2B1185">Entra a NotiCel</h2>
  <p><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#2B1185;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Entrar</a></p>
  <p style="color:#5C5F6E;font-size:13px">Si no pediste este enlace, ignora este correo.</p>
</div>
```
