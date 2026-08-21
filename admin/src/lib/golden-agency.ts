const GOLDEN_ORIGIN = "https://goldenbride.net";
const AGENCY_HELPER = `${GOLDEN_ORIGIN}/usermodule/services/agencyhelper/v2`;

function pickJsessionId(res: Response): string | null {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const lines =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [res.headers.get("set-cookie") || ""];
  for (const line of lines) {
    const m = /JSESSIONID=([^;,\s]+)/i.exec(line || "");
    if (m?.[1]) return m[1];
  }
  return null;
}

export async function goldenLogin(login: string, pass: string) {
  const res = await fetch(AGENCY_HELPER, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      command: "login",
      login: String(login).trim(),
      pass: String(pass),
    }),
  });

  const jsessionId = pickJsessionId(res);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  const ok =
    Boolean(jsessionId) &&
    (body as { success?: boolean } | null)?.success !== false;

  if (!ok || !jsessionId) {
    const err =
      (body as { error?: string } | null)?.error ||
      `Golden login failed (${res.status})`;
    throw new Error(err);
  }

  return { jsessionId, body };
}

type PhotoDto = {
  urlThumbnailMedium?: string;
  urlThumbnailMediumWebp?: string;
  urlPhoto?: string;
  urlPhotoWebp?: string;
  url?: string;
};

function firstPhotoUrl(lady: {
  url?: string;
  mainPhotoDTO?: PhotoDto | null;
  ownPhotos?: PhotoDto[] | null;
}): string | null {
  const candidates = [
    lady.url,
    lady.mainPhotoDTO?.urlThumbnailMediumWebp,
    lady.mainPhotoDTO?.urlThumbnailMedium,
    lady.mainPhotoDTO?.urlPhotoWebp,
    lady.mainPhotoDTO?.urlPhoto,
    lady.mainPhotoDTO?.url,
    ...(lady.ownPhotos || []).flatMap((p) => [
      p.urlThumbnailMediumWebp,
      p.urlThumbnailMedium,
      p.urlPhotoWebp,
      p.urlPhoto,
      p.url,
    ]),
  ];
  for (const c of candidates) {
    const u = String(c || "").trim();
    if (/^https?:\/\//i.test(u)) return u;
  }
  return null;
}

/** Login as lady and read her main photo URL from getLady. */
export async function fetchLadyAvatarUrl(externalId: string, password: string) {
  const { jsessionId } = await goldenLogin(externalId, password);
  const res = await fetch(AGENCY_HELPER, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: `JSESSIONID=${jsessionId}`,
    },
    body: JSON.stringify({ command: "getLady" }),
  });

  const body = (await res.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
    lady?: {
      url?: string;
      mainPhotoDTO?: PhotoDto | null;
      ownPhotos?: PhotoDto[] | null;
    };
  } | null;

  if (!body || body.success === false || !body.lady) {
    throw new Error(body?.error || `getLady failed (${res.status})`);
  }

  const url = firstPhotoUrl(body.lady);
  if (!url) throw new Error("No photo on lady profile");
  return url;
}

/**
 * Optional bulk path: agency login + getLadies.
 * Needs GOLDEN_AGENCY_LOGIN / GOLDEN_AGENCY_PASSWORD.
 */
export async function fetchAgencyLadiesPhotos(): Promise<Map<string, string>> {
  const login = process.env.GOLDEN_AGENCY_LOGIN?.trim();
  const pass = process.env.GOLDEN_AGENCY_PASSWORD || "";
  if (!login || !pass) {
    throw new Error("GOLDEN_AGENCY_LOGIN / GOLDEN_AGENCY_PASSWORD not set");
  }

  const { jsessionId } = await goldenLogin(login, pass);
  const map = new Map<string, string>();

  for (const status of ["active", "new", "unavailable"] as const) {
    const res = await fetch(AGENCY_HELPER, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: `JSESSIONID=${jsessionId}`,
      },
      body: JSON.stringify({ command: "getLadies", status }),
    });
    const body = (await res.json().catch(() => null)) as {
      success?: boolean;
      result?: Array<{ id?: number | string; photo?: string }>;
    } | null;
    if (!body?.result) continue;
    for (const row of body.result) {
      const id = String(row.id ?? "").trim();
      const photo = String(row.photo || "").trim();
      if (id && /^https?:\/\//i.test(photo)) map.set(id, photo);
    }
  }

  return map;
}
