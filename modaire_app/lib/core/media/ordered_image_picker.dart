import 'dart:io';

import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

/// Multi-image picking that returns photos in the order the user tapped them.
///
/// Why this exists: `image_picker`'s iOS implementation never sets
/// `PHPickerConfiguration.selection`, so it inherits Apple's `.default`, which
/// returns results in **photo-library order**. The first photo becomes a
/// listing's cover, so a seller tapping their best shot first would silently
/// get a different cover. iOS has `.ordered` for exactly this — it returns tap
/// order and draws the numbered badges — but the plugin doesn't expose it, and
/// upstream (0.8.13+6) has no support for it.
///
/// So iOS goes through a small native channel (ios/Runner/OrderedImagePicker.swift)
/// and every other platform keeps using `image_picker`. Android's photo picker
/// already returns selection order, so it needs nothing.
class OrderedImagePicker {
  OrderedImagePicker({ImagePicker? fallback})
      : _fallback = fallback ?? ImagePicker();

  static const _channel = MethodChannel('com.modaire.app/ordered_picker');

  final ImagePicker _fallback;

  /// Longest edge in pixels, and JPEG quality, applied natively before the
  /// bytes cross the channel. Chosen to match what the `image_picker` call
  /// they replace was passing (`maxWidth: 2048, imageQuality: 88`).
  static const _maxPixel = 2048;
  static const _quality = 0.88;

  /// Picks up to [limit] images, in selection order.
  ///
  /// Returns an empty list if the user cancels. Never throws for a cancel;
  /// a genuine platform failure falls back to `image_picker` rather than
  /// leaving the seller unable to add photos at all.
  Future<List<XFile>> pickMultiple({required int limit}) async {
    if (!Platform.isIOS) return _pickWithPlugin(limit: limit);
    try {
      final paths = await _channel.invokeListMethod<String>('pickImages', {
        'limit': limit,
        'maxPixel': _maxPixel,
        'quality': _quality,
      });
      return (paths ?? const []).map(XFile.new).toList();
    } on MissingPluginException {
      // Channel not registered — shouldn't happen in a normal build, but
      // degrading to unordered picking beats blocking the listing flow.
      return _pickWithPlugin(limit: limit);
    } on PlatformException {
      return _pickWithPlugin(limit: limit);
    }
  }

  Future<List<XFile>> _pickWithPlugin({required int limit}) async {
    if (limit == 1) {
      final one = await _fallback.pickImage(
        source: ImageSource.gallery,
        imageQuality: (_quality * 100).round(),
        maxWidth: _maxPixel.toDouble(),
      );
      return one == null ? const [] : [one];
    }
    return _fallback.pickMultiImage(
      imageQuality: (_quality * 100).round(),
      maxWidth: _maxPixel.toDouble(),
      limit: limit,
    );
  }
}
