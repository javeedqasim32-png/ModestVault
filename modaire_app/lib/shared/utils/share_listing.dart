import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

/// Canonical public URL for a listing — the same path the website serves, so
/// a shared link opens the real page (and, once universal links are set up,
/// deep-links back into the app).
Uri listingShareUri(String listingId) =>
    Uri.parse('https://shopmodaire.com/listings/$listingId');

/// Opens the native share sheet for a listing.
///
/// Shares the URL alone, matching src/components/marketplace/
/// ShareListingButton.tsx which calls `navigator.share({ title, url })` — the
/// recipient's link preview pulls the title and image from the page's OG
/// meta, which reads better than pasting them in as raw text.
///
/// Dismissing the sheet is a normal outcome, not an error: it returns
/// [ShareResultStatus.dismissed] and we stay silent. Only a genuine failure
/// to present the sheet falls back to the clipboard, mirroring the website's
/// fallback behaviour.
///
/// [context] must belong to the widget that was tapped: on iPad and macOS
/// UIActivityViewController is a popover and needs a source rect to anchor
/// to, so we derive one from that widget's render box.
Future<void> shareListing(BuildContext context, String listingId) async {
  final uri = listingShareUri(listingId);
  final messenger = ScaffoldMessenger.maybeOf(context);

  try {
    await Share.shareUri(uri, sharePositionOrigin: _originRect(context));
  } catch (_) {
    // Sheet couldn't be presented at all. Copy the link so the tap still
    // accomplishes something rather than appearing to do nothing.
    await Clipboard.setData(ClipboardData(text: uri.toString()));
    messenger?.showSnackBar(
      const SnackBar(content: Text('Listing link copied')),
    );
  }
}

/// Global rect of the tapped widget, for iPad popover anchoring. Null is a
/// valid value for share_plus on phones, where the sheet slides up from the
/// bottom regardless.
Rect? _originRect(BuildContext context) {
  final box = context.findRenderObject() as RenderBox?;
  if (box == null || !box.hasSize) return null;
  return box.localToGlobal(Offset.zero) & box.size;
}
