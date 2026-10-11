import Flutter
import ImageIO
import PhotosUI
import UIKit
import UniformTypeIdentifiers

/// Multi-image picking that preserves the order the seller tapped.
///
/// `image_picker` builds its `PHPickerConfiguration` without setting
/// `selection`, so it gets Apple's default (`.default`) which returns results
/// in **photo-library order**, not selection order. For a marketplace listing
/// that's wrong in a way sellers notice: the first photo becomes the cover,
/// so tapping your best shot first should make it the cover, and instead you
/// get whichever picked photo happens to sit earliest in the library.
///
/// `.ordered` fixes both halves at once — results come back in tap order, and
/// iOS draws the numbered 1,2,3 badges on the thumbnails so the seller can
/// see the order they're building. It's iOS 15+, which is this app's minimum
/// deployment target, so no fallback path is needed.
///
/// Downscaling is done here rather than in Dart because we'd otherwise carry
/// full-size HEIC frames across the platform channel. `CGImageSource` decodes
/// HEIC natively and applies the EXIF transform, matching what image_picker
/// did for us before.
class OrderedImagePicker: NSObject, FlutterPlugin, PHPickerViewControllerDelegate {

    private var pendingResult: FlutterResult?
    /// Bounds the longest edge, and the JPEG quality, both supplied by Dart so
    /// the values stay defined next to the rest of the upload settings.
    private var maxPixel: CGFloat = 2048
    private var quality: CGFloat = 0.88

    static func register(with registrar: FlutterPluginRegistrar) {
        let channel = FlutterMethodChannel(
            name: "com.modaire.app/ordered_picker",
            binaryMessenger: registrar.messenger()
        )
        registrar.addMethodCallDelegate(OrderedImagePicker(), channel: channel)
    }

    func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        guard call.method == "pickImages" else {
            result(FlutterMethodNotImplemented)
            return
        }
        // A second call while a picker is up would strand the first result.
        if pendingResult != nil {
            result(FlutterError(code: "IN_PROGRESS", message: "A picker is already open.", details: nil))
            return
        }
        guard let root = Self.topViewController() else {
            result(FlutterError(code: "NO_VIEW_CONTROLLER", message: "No view controller to present from.", details: nil))
            return
        }

        let args = call.arguments as? [String: Any] ?? [:]
        let limit = args["limit"] as? Int ?? 1
        maxPixel = CGFloat(args["maxPixel"] as? Int ?? 2048)
        quality = CGFloat(args["quality"] as? Double ?? 0.88)
        pendingResult = result

        var config = PHPickerConfiguration(photoLibrary: .shared())
        config.selectionLimit = limit
        config.filter = .images
        config.preferredAssetRepresentationMode = .current
        config.selection = .ordered  // the whole point of this file

        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        root.present(picker, animated: true)
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let result = pendingResult else { return }
        pendingResult = nil

        if results.isEmpty {
            result([])  // cancelled — Dart treats this the same as picking nothing
            return
        }

        // Item loading is async and completes out of order, so write each one
        // into its own slot rather than appending. `results` is already in tap
        // order thanks to `.ordered`; this preserves it.
        var paths = [String?](repeating: nil, count: results.count)
        let group = DispatchGroup()

        for (index, item) in results.enumerated() {
            group.enter()
            item.itemProvider.loadFileRepresentation(
                forTypeIdentifier: UTType.image.identifier
            ) { [weak self] url, _ in
                defer { group.leave() }
                guard let self, let url else { return }
                paths[index] = self.downscaleToJPEG(source: url)
            }
        }

        group.notify(queue: .main) {
            // Drop failures rather than failing the batch: one unreadable
            // asset (e.g. an iCloud item that won't materialise) shouldn't
            // discard photos the seller already chose.
            result(paths.compactMap { $0 })
        }
    }

    /// Decodes, downscales and re-encodes as JPEG into a temp file, returning
    /// its path. Returns nil if the asset can't be read.
    private func downscaleToJPEG(source url: URL) -> String? {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
            // Bakes in the EXIF orientation so the upload isn't sideways.
            kCGImageSourceCreateThumbnailWithTransform: true,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(src, 0, options as CFDictionary) else {
            return nil
        }
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(
            data, UTType.jpeg.identifier as CFString, 1, nil
        ) else { return nil }
        CGImageDestinationAddImage(
            dest, image,
            [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary
        )
        guard CGImageDestinationFinalize(dest) else { return nil }

        let out = FileManager.default.temporaryDirectory
            .appendingPathComponent("pick-\(UUID().uuidString).jpg")
        guard (try? data.write(to: out, options: .atomic)) != nil else { return nil }
        return out.path
    }

    /// Topmost presented controller, so the picker isn't presented onto a
    /// controller that's already covered by a sheet.
    private static func topViewController() -> UIViewController? {
        let key = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow }
        var top = key?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }
}
