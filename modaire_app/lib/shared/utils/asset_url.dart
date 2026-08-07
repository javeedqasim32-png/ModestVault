import '../../core/config/env.dart';

/// Backend serializers emit relative paths in dev (`/listings/uuid/file.webp`)
/// served from Next.js's `public/` dir, and absolute S3 URLs in prod. The
/// Flutter image cache needs absolute URLs in both cases, so callers wrap
/// any backend-provided image URL with this helper.
String resolveAssetUrl(String url) {
  if (url.isEmpty) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  final base = Env.apiBaseUrl.replaceAll(RegExp(r'/+$'), '');
  if (url.startsWith('/')) return '$base$url';
  return '$base/$url';
}
