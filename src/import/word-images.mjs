export function referencedWordImages(candidates, images) {
  const candidateHtml = (Array.isArray(candidates) ? candidates : [])
    .map((candidate) =>
      typeof candidate?.value === "string" ? candidate.value : "",
    )
    .join("\n");
  return (Array.isArray(images) ? images : []).filter(
    (image) =>
      image?.placeholder && candidateHtml.includes(String(image.placeholder)),
  );
}

export function replaceWordImageSources(value, replacements) {
  let html = String(value || "");
  for (const [placeholder, source] of replacements) {
    if (!placeholder || !source) continue;
    html = html.split(String(placeholder)).join(String(source));
  }
  return html;
}
