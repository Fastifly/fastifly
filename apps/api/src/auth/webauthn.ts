import type { ApiConfig } from "@fastifly/config";
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
    readonly requestOrigin?: string | undefined;
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
    readonly requestOrigin?: string | undefined;
  }) => Promise<PublicKeyCredentialRequestOptionsJSON>;
  readonly verifyAuthenticationResponse: (input: {
    readonly config: ApiConfig;
    readonly expectedChallenge: string;
    readonly passkey: StoredPasskeyCredential;
    readonly response: AuthenticationResponseJSON;
  }) => Promise<AuthenticatedPasskeyCredential | null>;
};

export class WebAuthnVerificationError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "WebAuthnVerificationError";
  }
}

export function getWebAuthnRpId(config: ApiConfig, requestOrigin?: string): string {
  if (config.webAuthnRpId) {
    return config.webAuthnRpId;
  }

  const origin = normalizeOrigin(requestOrigin);
  if (origin && getWebAuthnExpectedOrigins(config).includes(origin)) {
    return new URL(origin).hostname;
  }

  return new URL(config.openApiBaseUrl).hostname;
}

export function getWebAuthnExpectedOrigins(config: ApiConfig): readonly string[] {
  const configuredOrigins = [
    ...(config.webAuthnOrigins ?? []),
    ...(config.webAuthnOrigin ? [config.webAuthnOrigin] : []),
  ]
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => origin !== null);

  return uniqueValues(
    configuredOrigins.length > 0 ? configuredOrigins : [new URL(config.openApiBaseUrl).origin],
  );
}

function getWebAuthnExpectedRpIds(config: ApiConfig): readonly string[] {
  if (config.webAuthnRpId) {
    return [config.webAuthnRpId];
  }

  return uniqueValues(getWebAuthnExpectedOrigins(config).map((origin) => new URL(origin).hostname));
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

function normalizeOrigin(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function uniqueValues(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function toExpectedValue(values: readonly string[]): string | string[] {
  return values.length === 1 ? (values[0] ?? "") : [...values];
}

export const simpleWebAuthnAdapter: WebAuthnAdapter = {
  async generateRegistrationOptions(input) {
    return generateRegistrationOptions({
      rpName: input.config.webAuthnRpName,
      rpID: getWebAuthnRpId(input.config, input.requestOrigin),
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
    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;

    try {
      verification = await verifyRegistrationResponse({
        response: input.response,
        expectedChallenge: input.expectedChallenge,
        expectedOrigin: toExpectedValue(getWebAuthnExpectedOrigins(input.config)),
        expectedRPID: toExpectedValue(getWebAuthnExpectedRpIds(input.config)),
      });
    } catch (error) {
      throw new WebAuthnVerificationError("Passkey registration verification failed.", error);
    }

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
      rpID: getWebAuthnRpId(input.config, input.requestOrigin),
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

    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;

    try {
      verification = await verifyAuthenticationResponse({
        response: input.response,
        expectedChallenge: input.expectedChallenge,
        expectedOrigin: toExpectedValue(getWebAuthnExpectedOrigins(input.config)),
        expectedRPID: toExpectedValue(getWebAuthnExpectedRpIds(input.config)),
        credential,
      });
    } catch (error) {
      throw new WebAuthnVerificationError("Passkey login verification failed.", error);
    }

    if (!verification.verified) {
      return null;
    }

    return {
      credentialId: verification.authenticationInfo.credentialID,
      counter: verification.authenticationInfo.newCounter,
    };
  },
};
