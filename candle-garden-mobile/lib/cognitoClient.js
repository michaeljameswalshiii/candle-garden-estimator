/**
 * Lightweight Cognito IdP client (no Amplify).
 * Uses USER_PASSWORD_AUTH on a public app client.
 */
import { cognitoConfig } from './cognitoConfig';

const ENDPOINT = `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/`;

async function cognitoRequest(target, payload) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!res.ok) {
    const msg =
      data.message ||
      data.__type ||
      `Cognito error (${res.status})`;
    const err = new Error(msg);
    err.code = data.__type || data.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function signUp({ email, password, name }) {
  const attrs = [
    { Name: 'email', Value: email },
  ];
  if (name) {
    attrs.push({ Name: 'name', Value: name });
  }

  return cognitoRequest('SignUp', {
    ClientId: cognitoConfig.clientId,
    Username: email,
    Password: password,
    UserAttributes: attrs,
  });
}

export async function confirmSignUp({ email, code }) {
  return cognitoRequest('ConfirmSignUp', {
    ClientId: cognitoConfig.clientId,
    Username: email,
    ConfirmationCode: code,
  });
}

export async function resendConfirmationCode({ email }) {
  return cognitoRequest('ResendConfirmationCode', {
    ClientId: cognitoConfig.clientId,
    Username: email,
  });
}

export async function signIn({ email, password }) {
  const data = await cognitoRequest('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: cognitoConfig.clientId,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password,
    },
  });

  if (!data.AuthenticationResult) {
    throw new Error(
      data.ChallengeName
        ? `Additional step required: ${data.ChallengeName}`
        : 'Sign-in failed'
    );
  }

  return {
    accessToken: data.AuthenticationResult.AccessToken,
    idToken: data.AuthenticationResult.IdToken,
    refreshToken: data.AuthenticationResult.RefreshToken,
    expiresIn: data.AuthenticationResult.ExpiresIn,
  };
}

export async function refreshSession(refreshToken) {
  const data = await cognitoRequest('InitiateAuth', {
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: cognitoConfig.clientId,
    AuthParameters: {
      REFRESH_TOKEN: refreshToken,
    },
  });

  if (!data.AuthenticationResult) {
    throw new Error('Session refresh failed');
  }

  return {
    accessToken: data.AuthenticationResult.AccessToken,
    idToken: data.AuthenticationResult.IdToken,
    // Refresh token often not returned again
    refreshToken: data.AuthenticationResult.RefreshToken || refreshToken,
    expiresIn: data.AuthenticationResult.ExpiresIn,
  };
}

export async function getUser(accessToken) {
  return cognitoRequest('GetUser', {
    AccessToken: accessToken,
  });
}

export async function globalSignOut(accessToken) {
  try {
    await cognitoRequest('GlobalSignOut', {
      AccessToken: accessToken,
    });
  } catch {
    // Ignore network/logout errors — local clear still happens
  }
}

/** Permanently delete the signed-in user (Cognito DeleteUser). */
export async function deleteUser(accessToken) {
  return cognitoRequest('DeleteUser', {
    AccessToken: accessToken,
  });
}

export async function forgotPassword({ email }) {
  return cognitoRequest('ForgotPassword', {
    ClientId: cognitoConfig.clientId,
    Username: email,
  });
}

export async function confirmForgotPassword({ email, code, password }) {
  return cognitoRequest('ConfirmForgotPassword', {
    ClientId: cognitoConfig.clientId,
    Username: email,
    ConfirmationCode: code,
    Password: password,
  });
}

export async function changePassword({ accessToken, previousPassword, proposedPassword }) {
  return cognitoRequest('ChangePassword', {
    AccessToken: accessToken,
    PreviousPassword: previousPassword,
    ProposedPassword: proposedPassword,
  });
}

export function attributesToObject(userResult) {
  const attrs = {};
  (userResult.UserAttributes || []).forEach((a) => {
    attrs[a.Name] = a.Value;
  });
  return {
    username: userResult.Username,
    email: attrs.email || userResult.Username,
    name: attrs.name || attrs.email || 'Customer',
    phone: attrs.phone_number || '',
    sub: attrs.sub,
  };
}
