import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";

import type { ApiConfig } from "../config.js";

export type StoredPasskeyCredential = {
  readonly credentialId: string;
  readonly publicKey: string;
  readonly counter: number;
  readonly transportsJson?: readonly string[] | null;
};

export type RegisteredPasskeyCredential = {
  readonly credentialId: string;
  readonly publicKey: string;
  readonly counter: number;
  readonly transportsJson: readonly AuthenticatorTransportFuture[] | null;
};

export type AuthenticatedPasskeyCredential = {
  readonly credentialId: string;
  readonly counter: number;
};

export type WebAuthnAdapter = {
  readonly generateRegistrationOptions: (input: {
    readonly config: ApiConfig;
    readonly userId: string;
    readonly username: string;
    readonly displayName: string;
    readonly existingPasskeys: readonly StoredPasskeyCredential[];
  }) => Promise<PublicKeyCredentialCreationOptionsJSON>;
  readonly verifyRegistrationResponse: (input: {
    readonly config: ApiConfig;
    readonly expectedChallenge: string;
    readonly response: RegistrationResponseJSON;
  }) => Promise<RegisteredPasskeyCredential | null>;
  readonly generateAuthenticationOptions: (input: {
    readonly config: ApiConfig;
    readonly passkeys?: readonly StoredPasskeyCredential[];
  }) => Promise<PublicKeyCredentialRequestOptionsJSON>;
  readonly verifyAuthenticationResponse: (input: {
    readonly config: ApiConfig;
    readonly expectedChallenge: string;
    readonly passkey: StoredPasskeyCredential;
    readonly response: AuthenticationResponseJSON;
  }) => Promise<AuthenticatedPasskeyCredential | null>;
};

export function getWebAuthnRpId(config: ApiConfig): string {
  return config.webAuthnRpId ?? new URL(config.openApiBaseUrl).hostname;
}

export function getWebAuthnOrigin(config: ApiConfig): string {
  return config.webAuthnOrigin ?? new URL(config.openApiBaseUrl).origin;
}

function toBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const buffer = Buffer.from(value, "base64url");
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;

  return new Uint8Array(arrayBuffer);
}

function toTransports(
  transports: readonly string[] | null | undefined,
): AuthenticatorTransportFuture[] | undefined {
  return transports?.map((transport) => transport as AuthenticatorTransportFuture);
}

function toCredentialDescriptor(passkey: StoredPasskeyCredential): {
  id: string;
  transports?: AuthenticatorTransportFuture[];
} {
  const descriptor: { id: string; transports?: AuthenticatorTransportFuture[] } = {
    id: passkey.credentialId,
  };
  const transports = toTransports(passkey.transportsJson);

  if (transports) {
    descriptor.transports = transports;
  }

  return descriptor;
}

export const simpleWebAuthnAdapter: WebAuthnAdapter = {
  async generateRegistrationOptions(input) {
    return generateRegistrationOptions({
      rpName: input.config.webAuthnRpName,
      rpID: getWebAuthnRpId(input.config),
      userName: input.username,
      userID: Buffer.from(input.userId, "utf8"),
      userDisplayName: input.displayName,
      attestationType: "none",
      excludeCredentials: input.existingPasskeys.map(toCredentialDescriptor),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });
  },

  async verifyRegistrationResponse(input) {
    const verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: input.expectedChallenge,
      expectedOrigin: getWebAuthnOrigin(input.config),
      expectedRPID: getWebAuthnRpId(input.config),
    });

    if (!verification.verified) {
      return null;
    }

    const { credential } = verification.registrationInfo;
    return {
      credentialId: credential.id,
      publicKey: toBase64Url(credential.publicKey),
      counter: credential.counter,
      transportsJson: credential.transports ?? null,
    };
  },

  async generateAuthenticationOptions(input) {
    const options: Parameters<typeof generateAuthenticationOptions>[0] = {
      rpID: getWebAuthnRpId(input.config),
      userVerification: "required",
    };

    if (input.passkeys) {
      options.allowCredentials = input.passkeys.map(toCredentialDescriptor);
    }

    return generateAuthenticationOptions(options);
  },

  async verifyAuthenticationResponse(input) {
    const credential: Parameters<typeof verifyAuthenticationResponse>[0]["credential"] = {
      id: input.passkey.credentialId,
      publicKey: fromBase64Url(input.passkey.publicKey),
      counter: input.passkey.counter,
    };
    const transports = toTransports(input.passkey.transportsJson);

    if (transports) {
      credential.transports = transports;
    }

    const verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: input.expectedChallenge,
      expectedOrigin: getWebAuthnOrigin(input.config),
      expectedRPID: getWebAuthnRpId(input.config),
      credential,
    });

    if (!verification.verified) {
      return null;
    }

    return {
      credentialId: verification.authenticationInfo.credentialID,
      counter: verification.authenticationInfo.newCounter,
    };
  },
};
