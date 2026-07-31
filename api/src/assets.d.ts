// Wrangler bundles these as text via the rules in wrangler.toml; tsc needs
// matching module declarations to typecheck the imports in renderTemplate.ts.
declare module "*.html" {
  const content: string;
  export default content;
}
declare module "*.txt" {
  const content: string;
  export default content;
}
