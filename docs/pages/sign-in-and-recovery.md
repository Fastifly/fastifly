# Sign-In And Recovery

Fastifly is built so users can sign in safely and recover access when needed.

Finance data is sensitive. Access should be convenient, but not careless.

## Sign In Normally

Users can create an account, sign in, and sign out.

Fastifly keeps sessions in secure cookies so normal browser scripts cannot read the session token.

## If Your Session Expires

If your session expires while you are using Fastifly, the app should not throw away the screen you were on.

Fastifly shows a sign-in dialog on top of the current page. After you sign in again, you can continue from the same place.

You can also switch accounts, which clears the local app state and sends you back to sign in.

## Use Passkeys

Fastifly supports passkeys.

Passkeys let users sign in with a device-based credential, such as a fingerprint, face unlock, security key, or device PIN.

Users can:

- add a passkey
- rename a passkey
- see their saved passkeys
- remove a passkey
- sign in with a passkey

## Keep Recovery Options

Fastifly supports recovery codes.

Recovery codes help users get back into their account if they lose normal access.

The app stores only protected versions of those codes, not the plain codes users see.

## Avoid Locking Yourself Out

The product direction is clear: users should not accidentally remove every way to sign in.

Fastifly's access model is being built with that safety rule in mind.

## What This Means

You should be able to use modern sign-in methods without losing the ability to recover your account.

Security should protect you, not surprise you.
