/* Helpers for embedding image URLs inside a GHL product's description field.

   GHL's `medias` array requires media-library IDs (we can't push raw URLs),
   and the top-level `image` field is inconsistently returned by the list
   endpoint. To work around both, we append an HTML-comment marker to the
   description that round-trips reliably through GHL's API. The marker is
   stripped before the description is shown to clients. */

const IWIG_IMG_RE = /\s*<!--IWIG_IMG:(\{[\s\S]*?\})-->\s*/;

function packDescription(description, image, images) {
  const cleanBase = String(description || '').replace(IWIG_IMG_RE, '').trim();
  const extras = Array.isArray(images) ? images.filter(Boolean) : [];
  const hasAny = !!image || extras.length > 0;
  if (!hasAny) return cleanBase;
  const payload = JSON.stringify({ main: image || null, extras });
  const marker = `<!--IWIG_IMG:${payload}-->`;
  return cleanBase ? `${cleanBase}\n\n${marker}` : marker;
}

function unpackDescription(rawDescription) {
  const desc = String(rawDescription || '');
  const match = desc.match(IWIG_IMG_RE);
  let main = null;
  let images = [];
  if (match) {
    try {
      const data = JSON.parse(match[1]);
      main = data.main || null;
      images = Array.isArray(data.extras) ? data.extras.filter(Boolean) : [];
    } catch {}
  }
  const description = desc.replace(IWIG_IMG_RE, '').trim();
  return { description, image: main, images };
}

module.exports = { packDescription, unpackDescription };
