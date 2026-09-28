import { Helmet } from "react-helmet-async";

interface PublicPageMetadataProps {
  title: string;
  description: string;
  path: string;
}

// Pass the page's stable route, not location.href (which can contain tracking data).
export function PublicPageMetadata({ title, description, path }: PublicPageMetadataProps) {
  const canonical = `https://xn--80aaiswd0ak.xn--p1ai${path}`;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
    </Helmet>
  );
}
