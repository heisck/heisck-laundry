import { jwtVerify, SignJWT } from "jose";

const encoder = new TextEncoder();

function getTrackingSecret(): Uint8Array {
  const secret = process.env.TRACKING_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "TRACKING_TOKEN_SECRET must be set and at least 32 characters long.",
    );
  }

  return encoder.encode(secret);
}

export async function signTrackingToken(
  packageId: string,
  tokenId: string,
  expiresAt: Date,
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(packageId)
    .setJti(tokenId)
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getTrackingSecret());
}

export async function verifyTrackingToken(token: string): Promise<{
  packageId: string;
  tokenId: string;
}> {
  const { payload } = await jwtVerify(token, getTrackingSecret(), {
    algorithms: ["HS256"],
  });

  if (!payload.sub || !payload.jti) {
    throw new Error("Invalid token payload.");
  }

  return {
    packageId: payload.sub,
    tokenId: payload.jti,
  };
}
