import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:uuid/uuid.dart';

import 'dart:async';

import '../../../app/theme.dart';
import '../../../core/ai/ai_cover_repository.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/media/ordered_image_picker.dart';
import '../../../core/seller/seller_repository.dart';
import '../../../core/uploads/upload_repository.dart';
import '../../../shared/utils/asset_url.dart';
import '../../../shared/widgets/modaire_app_bar.dart';

// Mirrors src/lib/taxonomy.ts — keep these in sync when the website
// taxonomy changes (it's tiny enough that bundling here is fine; a
// /api/v1/meta/taxonomy endpoint can replace this when we add a third
// surface that needs the list).
const _kStyles = <String>[
  'Bridals',
  'Festive Pret',
  'Formals',
  'Modest Wear',
  'Western',
];
const _kCategories = <String>[
  'Abayas',
  'Accessories',
  'Dresses',
  'Kaftans',
  'Sarees',
  'Suits',
];

// Subcategory + type mapping mirrors src/lib/taxonomy.ts. Categories
// not listed here have no subcategories (the dropdown stays hidden).
const _kSubcategoriesByCategory = <String, List<String>>{
  'Accessories': [
    'Bags',
    'Belts',
    'Dupattas',
    'Hair Accessories',
    'Hijabs',
    'Jewelry',
    'Pins',
  ],
  'Suits': [
    'Anarkali',
    'Churidar',
    'Co-Ord Set',
    'Gharara',
    'Lehenga',
    'Shalwar Kameez',
    'Sharara',
  ],
};
const _kTypesBySubcategory = <String, List<String>>{
  'Shalwar Kameez': ['2 Piece', '3 Piece', '4 Piece'],
};
const _kConditions = <String>[
  'New with tags',
  'Like new',
  'Good',
  'Fair',
];
const _kSizes = <String>[
  'XS',
  'Small',
  'Medium',
  'Large',
  'XLarge',
  'XXLarge',
];

// Skin-tone variants — mirrors SKIN_TONE_OPTIONS in src/lib/ai-cover-options.ts.
// The label rendered in the picker is "Model N" (matches the web wording);
// the swatch color is used as a placeholder while the thumbnail loads.
class _SkinToneOption {
  const _SkinToneOption({
    required this.value,
    required this.swatch,
    required this.thumbnail,
  });
  final String value;
  final int swatch;
  final String thumbnail;
}

const String _kModaireBucketUrl =
    'https://modestvault.s3.us-east-1.amazonaws.com/Ai-template-skintone';
const List<_SkinToneOption> _kSkinTones = [
  _SkinToneOption(
      value: 'fair',
      swatch: 0xFFF1D5BB,
      thumbnail: '$_kModaireBucketUrl/1-2.png'),
  _SkinToneOption(
      value: 'light',
      swatch: 0xFFDDA984,
      thumbnail: '$_kModaireBucketUrl/2-2.png'),
  _SkinToneOption(
      value: 'medium',
      swatch: 0xFFB9784F,
      thumbnail: '$_kModaireBucketUrl/3-2.png'),
  _SkinToneOption(
      value: 'tan',
      swatch: 0xFF8B5A2B,
      thumbnail: '$_kModaireBucketUrl/4-2.png'),
  _SkinToneOption(
      value: 'deep',
      swatch: 0xFF3D2718,
      thumbnail: '$_kModaireBucketUrl/5.2.png'),
];

// A listing holds at most MAX_LISTING_IMAGES (6) images server-side. Of
// those the seller uploads 5; the AI cover is the sixth. Mirrors
// PHOTO_LIMIT in src/app/sell/SellPageClient.tsx.
const _kMaxUserPhotos = 5;

/// Photos required before a listing can be published. Mirrors
/// MIN_PHOTOS_TO_PUBLISH in src/app/sell/SellPageClient.tsx. The app used to
/// require only one, so the same item could be published from the phone that
/// the website refused — while the label above the grid claimed three were
/// required. Counts the AI cover, as the website does.
const _kMinPhotosToPublish = 3;

class CreateListingScreen extends ConsumerStatefulWidget {
  const CreateListingScreen({super.key, this.resumeDraftId});

  /// When non-null, the wizard loads that draft and edits in place
  /// (same draft id used for save/publish, so photos already uploaded
  /// under `drafts/<userId>/<draftId>/` stay attached).
  final String? resumeDraftId;

  @override
  ConsumerState<CreateListingScreen> createState() =>
      _CreateListingScreenState();
}

class _CreateListingScreenState extends ConsumerState<CreateListingScreen> {
  late final String _draftId = widget.resumeDraftId ?? const Uuid().v4();
  final _picker = OrderedImagePicker();
  final _formKey = GlobalKey<FormState>();

  // Photo URLs uploaded so far (server-normalized public URLs). Slot
  // index in the grid maps 1:1 to this list's index.
  /// Seller-uploaded photos in display order. Compact — no empty slots —
  /// so the UI can mirror the website, which shows a dropzone until there
  /// are photos and then only as many tiles as exist.
  final List<String> _userPhotos = [];

  /// The AI-generated cover, kept separate because the server stores it in
  /// its own column (draft.generated_image_urls) and publishes it ahead of
  /// the seller's photos.
  String? _aiCover;

  /// How many uploads are in flight; drives the trailing spinner tiles.
  int _uploadsInFlight = 0;

  final _title = TextEditingController();
  final _brand = TextEditingController();
  final _price = TextEditingController();
  final _description = TextEditingController();
  final _measurements = TextEditingController();
  String? _style;
  String? _category;
  String? _subcategory;
  String? _type;
  String? _condition;
  String? _size;

  bool _loading = false;
  bool _saving = false;
  bool _publishing = false;
  String? _error;

  /// True once the draft row exists on the server. Photo uploads call
  /// /api/v1/uploads/presign with [_draftId] and the server only hands
  /// out a presigned URL if a Draft row with that id is already in the
  /// DB — so we have to ghost-save an empty draft before the very first
  /// upload in a fresh "New listing" session. Existing-draft flows
  /// (resumeDraftId != null) start with this true.
  bool _draftCreatedOnServer = false;

  String? _aiJobId;
  String _aiStatus = '';
  Timer? _aiPollTimer;
  String _modelSkinTone = 'medium';
  bool _hijabRequired = false;

  @override
  void initState() {
    super.initState();
    if (widget.resumeDraftId != null) {
      _draftCreatedOnServer = true;
      _loadDraft();
    }
  }

  /// Idempotent server-side draft create — first photo upload in a fresh
  /// session (or any other server-touching action) calls this so the
  /// Draft row exists before we hit /uploads/presign. Re-running is a
  /// cheap no-op once [_draftCreatedOnServer] flips.
  Future<void> _ensureDraftExists() async {
    if (_draftCreatedOnServer) return;
    await ref.read(sellerRepositoryProvider).saveDraft(id: _draftId);
    _draftCreatedOnServer = true;
  }

  @override
  void dispose() {
    _aiPollTimer?.cancel();
    _title.dispose();
    _brand.dispose();
    _price.dispose();
    _description.dispose();
    _measurements.dispose();
    super.dispose();
  }

  bool get _hasAnyPhoto => _photoCount > 0;

  /// Everything that will be published, AI cover included — the same total
  /// the website counts against its minimum.
  int get _photoCount => _userPhotos.length + (_aiCover == null ? 0 : 1);
  bool get _aiInFlight =>
      _aiJobId != null && _aiStatus != 'COMPLETED' && _aiStatus != 'FAILED';

  Future<void> _generateAICover() async {
    if (_aiInFlight) return;
    if (!_hasAnyPhoto) {
      _setError('Add at least one photo before generating a cover.');
      return;
    }
    // The job requires the same metadata that publish does, since it
    // snapshots into the prompt. Push the user to fill in the form
    // first so the AI worker doesn't 400 us back.
    if (_title.text.trim().isEmpty ||
        _style == null ||
        _category == null ||
        _description.text.trim().isEmpty) {
      _setError('Fill in title, style, category, and description first.');
      return;
    }
    setState(() {
      _error = null;
      _aiStatus = 'STARTING';
    });
    try {
      // Persist draft so the backend sees the latest snapshot fields.
      await ref.read(sellerRepositoryProvider).saveDraft(
            id: _draftId,
            title: _title.text.trim(),
            style: _style,
            category: _category,
            subcategory: _subcategory,
            type: _type,
            price: _price.text.trim(),
            brand: _brand.text.trim(),
            description: _description.text.trim(),
            condition: _condition,
            size: _size,
            measurements: _measurements.text.trim(),
          );
      final jobId = await ref.read(aiCoverRepositoryProvider).startJob(
            draftId: _draftId,
            modelSkinTone: _modelSkinTone,
            hijabRequired: _hijabRequired,
          );
      if (!mounted) return;
      setState(() {
        _aiJobId = jobId;
        _aiStatus = 'QUEUED';
      });
      _startPolling();
    } on ApiException catch (e) {
      _setError(e.message);
      setState(() => _aiStatus = '');
    } catch (_) {
      _setError('Couldn\'t start AI cover generation.');
      setState(() => _aiStatus = '');
    }
  }

  void _startPolling() {
    _aiPollTimer?.cancel();
    _aiPollTimer = Timer.periodic(const Duration(seconds: 5), (_) => _pollOnce());
    _pollOnce();
  }

  Future<void> _pollOnce() async {
    final jobId = _aiJobId;
    if (jobId == null) return;
    try {
      final job = await ref.read(aiCoverRepositoryProvider).getJob(jobId);
      if (!mounted) return;
      setState(() => _aiStatus = job.status);
      if (!job.isTerminal) return;
      _aiPollTimer?.cancel();
      if (job.status == 'COMPLETED' && job.resultImageUrl != null) {
        await ref.read(aiCoverRepositoryProvider).attachToDraft(
              draftId: _draftId,
              imageUrl: job.resultImageUrl!,
            );
        if (!mounted) return;
        // Held separately from _userPhotos so it can never displace one.
        setState(() => _aiCover = job.resultImageUrl);
      } else if (job.status == 'FAILED') {
        _setError(job.errorMessage ?? 'AI cover generation failed.');
      }
    } on ApiException catch (e) {
      // Don't kill the timer on transient errors; let the next tick try.
      debugPrint('AI poll error: ${e.message}');
    }
  }

  Future<void> _loadDraft() async {
    setState(() => _loading = true);
    try {
      final drafts = await ref.read(sellerRepositoryProvider).drafts();
      final draft = drafts.firstWhere(
        (d) => d.id == widget.resumeDraftId,
        orElse: () => throw ApiException(
          code: 'NOT_FOUND',
          message: 'Draft not found',
        ),
      );
      if (!mounted) return;
      setState(() {
        _title.text = draft.title;
        _brand.text = draft.brand;
        _price.text = draft.price;
        _description.text = draft.description;
        _measurements.text = draft.measurements;
        _style = draft.style.isEmpty ? null : draft.style;
        _category = draft.category.isEmpty ? null : draft.category;
        _subcategory = draft.subcategory.isEmpty ? null : draft.subcategory;
        _type = draft.type.isEmpty ? null : draft.type;
        _condition = draft.condition.isEmpty ? null : draft.condition;
        _size = draft.size.isEmpty ? null : draft.size;
        // Backfill photo slots from whatever the draft already has
        // attached (uploaded user shots first, then AI-generated covers).
        _userPhotos
          ..clear()
          ..addAll(draft.photoUrls.take(_kMaxUserPhotos));
        // Last, not first: attach-ai-cover APPENDS, so regenerating leaves
        // the superseded covers in place. The newest is the one the seller
        // was looking at. Saving prunes the rest (we send just this one).
        _aiCover = draft.generatedImageUrls.isEmpty
            ? null
            : draft.generatedImageUrls.last;
      });
    } on ApiException catch (e) {
      _setError(e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Pick photos and append them. Multi-select is capped at the free
  /// capacity so iOS stops the seller itself, rather than us discarding
  /// choices they've already made.
  Future<void> _addPhotos() async {
    final remaining = _kMaxUserPhotos - _userPhotos.length - _uploadsInFlight;
    if (remaining <= 0) return;

    List<XFile> picked;
    try {
      // Returns photos in the order they were TAPPED. The plugin's own
      // multi-pick returns iOS library order instead, which quietly made the
      // cover a different photo than the one the seller chose first.
      picked = await _picker.pickMultiple(limit: remaining);
    } catch (e) {
      debugPrint('[create-listing] picker threw: $e');
      _setError('Couldn\'t open your photos: $e');
      return;
    }

    // `limit` is advisory on some platforms — trim rather than trust it.
    final files = picked.take(remaining).toList();
    if (files.isEmpty || !mounted) return;

    setState(() => _uploadsInFlight += files.length);
    try {
      // The draft row must exist before any presign, and creating it isn't
      // safe to race — do it once up front rather than per upload.
      await _ensureDraftExists();
      // Future.wait keeps argument order regardless of which upload finishes
      // first, so photos land in the order the seller picked them. Order is
      // meaningful: the first photo fronts the listing when there's no AI
      // cover.
      final urls = await Future.wait(files.map(_uploadOne));
      if (!mounted) return;
      setState(() => _userPhotos.addAll(urls.whereType<String>()));
      if (urls.any((u) => u == null)) {
        _setError('Some photos couldn\'t be uploaded.');
      }
    } on ApiException catch (e) {
      _setError(e.message);
    } catch (e, st) {
      debugPrint('[create-listing] upload threw: $e\n$st');
      _setError('Couldn\'t upload those photos.');
    } finally {
      if (mounted) setState(() => _uploadsInFlight -= files.length);
    }
  }

  /// Upload a single file, returning its URL or null if it failed. Null
  /// rather than throwing so one bad photo doesn't discard a whole batch.
  Future<String?> _uploadOne(XFile file) async {
    try {
      final bytes = await file.readAsBytes();
      final contentType = _contentTypeFor(file.path) ?? 'image/jpeg';
      final result = await ref.read(uploadRepositoryProvider).uploadDraftPhoto(
            draftId: _draftId,
            bytes: bytes,
            contentType: contentType,
          );
      return result.publicUrl;
    } catch (e) {
      debugPrint('[create-listing] upload failed for ${file.path}: $e');
      return null;
    }
  }

  /// Removes locally; the server's photo_urls is reconciled on the next
  /// save or publish, which sends the surviving list (see [_persistDraft]).
  /// The S3 object itself is left behind — orphan cleanup is a separate
  /// concern from what the draft points at.
  void _removePhoto(int index) {
    setState(() => _userPhotos.removeAt(index));
  }

  void _removeAiCover() => setState(() => _aiCover = null);

  /// Reorder handler for the thumbnail grid. Mirrors the website's
  /// drag-to-rearrange, which is how sellers choose which shot leads.
  /// Move the photo at [from] to the position [to] currently occupies.
  ///
  /// No index adjustment here: [to] is the target TILE's index, not an
  /// insertion point. After removeAt the later elements shift down by one,
  /// which is exactly what makes a plain insert(to) land the photo where the
  /// seller dropped it. (ReorderableListView's `newIndex > oldIndex` fudge
  /// applies to its insertion-index convention and is wrong here — it made
  /// every rightward drag stop one tile short.)
  void _reorderPhoto(int from, int to) {
    if (from == to) return;
    setState(() {
      final moved = _userPhotos.removeAt(from);
      _userPhotos.insert(to.clamp(0, _userPhotos.length), moved);
    });
    HapticFeedback.selectionClick();
  }

  String? _contentTypeFor(String path) {
    final lower = path.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.heic')) return 'image/jpeg'; // image_picker
    return null;
  }

  void _setError(String message) {
    if (!mounted) return;
    setState(() => _error = message);
    // Also surface via SnackBar — the inline error banner lives near the
    // bottom of the form, so a user tapping "Generate AI cover" at the
    // top of the screen wouldn't see the validation reason without
    // scrolling. SnackBar gives instant feedback regardless of scroll.
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  List<String> get _subcategoryOptions =>
      _category == null ? const [] : (_kSubcategoriesByCategory[_category] ?? const []);

  List<String> get _typeOptions =>
      _subcategory == null ? const [] : (_kTypesBySubcategory[_subcategory] ?? const []);

  Future<void> _persistDraft({required bool thenPublish}) async {
    if (_saving || _publishing) return;
    // A save now WRITES photo_urls, so it must not run against a photo
    // list that's still filling in: /uploads/finalize appends the in-flight
    // photo server-side, and whichever of the two lands second wins. The
    // buttons are disabled meanwhile; this is the belt-and-braces check.
    if (_uploadsInFlight > 0) {
      _setError('Hang on — still uploading your photos.');
      return;
    }
    if (thenPublish) {
      if (!(_formKey.currentState?.validate() ?? false)) return;
      if (_photoCount < _kMinPhotosToPublish) {
        final needed = _kMinPhotosToPublish - _photoCount;
        // Same two-message split as the website: a bare requirement when
        // they haven't started, a countdown once they have.
        _setError(
          _photoCount == 0
              ? 'Please add at least $_kMinPhotosToPublish photos before '
                  'publishing your listing.'
              : 'Please add $needed more photo${needed == 1 ? '' : 's'}. '
                  'Listings need at least $_kMinPhotosToPublish photos to '
                  'publish.',
        );
        return;
      }
    }
    setState(() {
      _saving = !thenPublish;
      _publishing = thenPublish;
      _error = null;
    });
    try {
      final repo = ref.read(sellerRepositoryProvider);
      await repo.saveDraft(
        id: _draftId,
        title: _title.text.trim(),
        style: _style,
        category: _category,
        subcategory: _subcategory,
        type: _type,
        price: _price.text.trim(),
        brand: _brand.text.trim(),
        description: _description.text.trim(),
        condition: _condition,
        size: _size,
        measurements: _measurements.text.trim(),
        // The grid's order and removals live in Flutter state until this
        // point — without these the seller's arrangement was silently
        // dropped and deleted photos came back (and got published).
        photoUrls: _userPhotos,
        generatedImageUrls: _aiCover == null ? const [] : [_aiCover!],
      );
      _draftCreatedOnServer = true;
      if (thenPublish) {
        await repo.publishDraft(_draftId);
      }
      if (!mounted) return;
      ref.invalidate(sellerListingsProvider);
      ref.invalidate(sellerDraftsProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            thenPublish ? 'Submitted for review' : 'Draft saved',
          ),
        ),
      );
      context.pop();
    } on ApiException catch (e) {
      _setError(e.message);
    } catch (e) {
      _setError('Something went wrong. Please try again.');
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
          _publishing = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ModaireColors.browsePageBg,
      // Save draft lives in the bottom bar next to Submit for review, not
      // up here — the two are the same kind of decision ("what do I do
      // with this listing?") and belong together at thumb height.
      appBar: const ModaireAppBar(),
      body: SafeArea(
        child: _loading
            ? const Center(
                child: CircularProgressIndicator(
                  color: ModaireColors.espresso,
                  strokeWidth: 2,
                ),
              )
            : Column(
          children: [
            Expanded(
              child: Form(
                key: _formKey,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  children: [
                    // 1. Intro card — serif "Create Listing" header + advisory
                    //    copy. Cream-on-cream inset matching the website's
                    //    nested-card pattern.
                    _introCard(),
                    const SizedBox(height: 20),

                    // 2. Title — first input the seller sees.
                    _fieldLabel('TITLE', required: true),
                    const SizedBox(height: 8),
                    _textField(_title, 'e.g., Silk Floral Abaya',
                        required: true),
                    const SizedBox(height: 24),

                    // 3. Product Photos — letter-spaced caps label,
                    //    serif sub-heading, body copy, then the grid.
                    _fieldLabel('PRODUCT PHOTOS (3 REQUIRED, UP TO 6)',
                        required: true),
                    const SizedBox(height: 6),
                    Text(
                      'Add Photos',
                      style: GoogleFonts.cormorantGaramond(
                        fontSize: 22,
                        fontWeight: FontWeight.w600,
                        color: ModaireColors.tileTextPrimary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Add clear, well-lit photos to help your item sell faster.',
                      style: GoogleFonts.jost(
                        fontSize: 13,
                        color: ModaireColors.tileTextSubtle,
                      ),
                    ),
                    const SizedBox(height: 12),
                    _photoGrid(),
                    const SizedBox(height: 24),

                    // 4. Create Styled Preview — nested bordered card with
                    //    sparkle header, model picker, hijab toggle, and
                    //    the espresso Create Preview CTA. Matches the
                    //    website's nested-card treatment exactly.
                    _styledPreviewCard(),
                    const SizedBox(height: 24),

                    // 5. Rest of the form — Style, Category, optional
                    //    Subcategory/Type, Size + Condition row, Brand,
                    //    Price, Description, Measurements.
                    _fieldLabel('STYLE', required: true),
                    const SizedBox(height: 8),
                    _dropdown('Select Style', _kStyles, _style, (v) {
                      setState(() => _style = v);
                    }, required: true),
                    const SizedBox(height: 16),

                    _fieldLabel('CATEGORY', required: true),
                    const SizedBox(height: 8),
                    _dropdown('Select Category', _kCategories, _category, (v) {
                      setState(() {
                        _category = v;
                        _subcategory = null;
                        _type = null;
                      });
                    }, required: true),

                    if (_subcategoryOptions.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      _fieldLabel('SUBCATEGORY'),
                      const SizedBox(height: 8),
                      _dropdown(
                        'Select Subcategory',
                        _subcategoryOptions,
                        _subcategory,
                        (v) => setState(() {
                          _subcategory = v;
                          _type = null;
                        }),
                      ),
                    ],
                    if (_typeOptions.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      _fieldLabel('TYPE'),
                      const SizedBox(height: 8),
                      _dropdown('Select Type', _typeOptions, _type,
                          (v) => setState(() => _type = v)),
                    ],

                    const SizedBox(height: 16),
                    _fieldLabel('PRICE (\$)', required: true),
                    const SizedBox(height: 8),
                    _textField(
                      _price,
                      '0.00',
                      required: true,
                      keyboardType: const TextInputType.numberWithOptions(
                          decimal: true),
                      validator: (v) {
                        final s = v?.trim() ?? '';
                        if (s.isEmpty) return 'Required';
                        final n = double.tryParse(s);
                        if (n == null || n <= 0) {
                          return 'Enter a price greater than 0';
                        }
                        return null;
                      },
                    ),

                    const SizedBox(height: 16),
                    _fieldLabel('BRAND'),
                    const SizedBox(height: 8),
                    _textField(_brand, 'e.g., Luxury Modest'),

                    const SizedBox(height: 16),
                    _fieldLabel('DESCRIPTION', required: true),
                    const SizedBox(height: 8),
                    _textField(
                      _description,
                      'Describe the texture, fit, and details of this piece…',
                      required: true,
                      maxLines: 5,
                    ),

                    const SizedBox(height: 16),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _fieldLabel('CONDITION', required: true),
                              const SizedBox(height: 8),
                              _dropdown(
                                'Select Condition',
                                _kConditions,
                                _condition,
                                (v) => setState(() => _condition = v),
                                required: true,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _fieldLabel('SIZE', required: true),
                              const SizedBox(height: 8),
                              _dropdown(
                                'Select Size',
                                _kSizes,
                                _size,
                                (v) => setState(() => _size = v),
                                required: true,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 16),
                    _fieldLabel('MEASUREMENTS (OPTIONAL)'),
                    const SizedBox(height: 8),
                    _textField(
                      _measurements,
                      'Bust, waist, hip, length…',
                      maxLines: 4,
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color:
                              ModaireColors.destructive.withValues(alpha: 0.08),
                          border: Border.all(
                            color: ModaireColors.destructive
                                .withValues(alpha: 0.3),
                          ),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          _error!,
                          style: GoogleFonts.jost(
                            fontSize: 13,
                            color: ModaireColors.destructive,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            _publishBar(),
          ],
        ),
      ),
    );
  }

  Widget _publishBar() {
    return Container(
      decoration: const BoxDecoration(
        color: ModaireColors.pillBg,
        border: Border(top: BorderSide(color: ModaireColors.pillBorder)),
      ),
      padding: EdgeInsets.fromLTRB(
        16,
        12,
        16,
        12 + MediaQuery.viewPaddingOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _submitButton(),
          const SizedBox(height: 8),
          _saveDraftButton(),
        ],
      ),
    );
  }

  Widget _submitButton() {
    return SizedBox(
        height: 48,
        width: double.infinity,
        child: ElevatedButton(
          // Blocked while an AI cover is generating, matching the website
          // (`disabled={... || isGenerating || !!aiJobId || ...}` in
          // SellPageClient.tsx). It matters more here: publishing DELETES the
          // draft server-side, so a cover that finishes afterwards has
          // nothing left to attach to and is silently lost. Uploads block it
          // too — the save that precedes publish writes photo_urls, and a
          // photo still in flight isn't in that list yet.
          onPressed:
              (_saving || _publishing || _aiInFlight || _uploadsInFlight > 0)
                  ? null
                  : () => _persistDraft(thenPublish: true),
          style: ElevatedButton.styleFrom(
            backgroundColor: ModaireColors.espresso,
            disabledBackgroundColor:
                ModaireColors.espresso.withValues(alpha: 0.4),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(99),
            ),
          ),
          child: _aiInFlight
              ? Text(
                  'Generating cover…',
                  style: GoogleFonts.jost(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    color: ModaireColors.cream,
                  ),
                )
              : _publishing
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: ModaireColors.cream,
                  ),
                )
              : Text(
                  'Submit for review',
                  style: GoogleFonts.jost(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    color: ModaireColors.cream,
                  ),
                ),
        ),
      );
  }

  /// Secondary action under Submit for review. Outlined rather than filled
  /// so Submit stays the obvious primary — saving is the way out for a
  /// listing that isn't ready yet, not the goal.
  Widget _saveDraftButton() {
    // Same gates as Submit: a save writes photo_urls, so it must not race
    // an in-flight upload or an AI cover that hasn't attached yet.
    final blocked =
        _saving || _publishing || _aiInFlight || _uploadsInFlight > 0;
    return SizedBox(
      height: 48,
      width: double.infinity,
      child: OutlinedButton(
        onPressed: blocked ? null : () => _persistDraft(thenPublish: false),
        style: OutlinedButton.styleFrom(
          backgroundColor: ModaireColors.tileBg,
          side: const BorderSide(color: ModaireColors.pillBorder),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(99),
          ),
        ),
        child: _saving
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: ModaireColors.espresso,
                ),
              )
            : Text(
                'Save as draft',
                style: GoogleFonts.jost(
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                  color: blocked
                      ? ModaireColors.tileTextSubtle
                      : ModaireColors.espresso,
                ),
              ),
      ),
    );
  }

  /// Photo section. Mirrors the website's uploader: a single dropzone while
  /// there are no photos, then a grid of only the tiles that exist — no
  /// permanently-empty placeholder boxes.
  Widget _photoGrid() {
    if (!_hasAnyPhoto && _uploadsInFlight == 0) return _dropzone();

    final canAddMore =
        _userPhotos.length + _uploadsInFlight < _kMaxUserPhotos;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            if (_aiCover != null) _aiCoverTile(),
            for (var i = 0; i < _userPhotos.length; i++) _draggableTile(i),
            for (var i = 0; i < _uploadsInFlight; i++) _uploadingTile(),
            if (canAddMore) _addTile(),
          ],
        ),
        const SizedBox(height: 8),
        // Surfaces the minimum while they're still adding photos, rather
        // than letting them fill the whole form and get refused at Submit.
        Text(
          _photoCount < _kMinPhotosToPublish
              ? '${_kMinPhotosToPublish - _photoCount} more '
                  '${_kMinPhotosToPublish - _photoCount == 1 ? 'photo' : 'photos'}'
                  ' needed to publish.'
              : _userPhotos.length > 1
                  ? 'Press and hold a photo to change the order.'
                  : 'Add up to $_kMaxUserPhotos photos.',
          style: GoogleFonts.jost(
            fontSize: 11,
            color: _photoCount < _kMinPhotosToPublish
                ? const Color(0xFFB91C1C)
                : ModaireColors.tileTextSubtle,
          ),
        ),
      ],
    );
  }

  static const double _kTile = 96;

  /// Empty state — the website's full-width dashed dropzone.
  Widget _dropzone() {
    return GestureDetector(
      onTap: _addPhotos,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 24),
        decoration: BoxDecoration(
          color: const Color(0xFFFBF9F6),
          borderRadius: BorderRadius.circular(28),
          border: Border.all(
            color: const Color(0xFFCFB79F),
            style: BorderStyle.solid,
          ),
        ),
        child: Column(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFFF2E7DE)),
              ),
              child: const Icon(
                LucideIcons.cloudUpload,
                size: 24,
                color: Color(0xFF7A6050),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Upload Photos',
              style: GoogleFonts.jost(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: ModaireColors.tileTextPrimary,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Select up to $_kMaxUserPhotos photos of your item. '
              'Press and hold to rearrange their order.',
              textAlign: TextAlign.center,
              style: GoogleFonts.jost(
                fontSize: 12,
                height: 1.4,
                color: ModaireColors.tileTextSubtle,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tileFrame({required Widget child}) => ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: SizedBox(width: _kTile, height: _kTile, child: child),
      );

  /// A seller photo. LongPressDraggable + DragTarget rather than a package:
  /// at most five tiles, so this is cheaper than a new dependency.
  Widget _draggableTile(int index) {
    final tile = _photoTile(
      url: _userPhotos[index],
      onRemove: () => _removePhoto(index),
      badge: (_aiCover == null && index == 0) ? 'Cover' : null,
    );
    return DragTarget<int>(
      onWillAcceptWithDetails: (d) => d.data != index,
      onAcceptWithDetails: (d) => _reorderPhoto(d.data, index),
      builder: (context, candidate, __) => Opacity(
        opacity: candidate.isNotEmpty ? 0.6 : 1,
        child: LongPressDraggable<int>(
          data: index,
          // Shorter than the 500ms default: sellers were pressing and
          // giving up before the drag engaged.
          delay: const Duration(milliseconds: 220),
          onDragStarted: HapticFeedback.mediumImpact,
          feedback: Material(
            color: Colors.transparent,
            child: Opacity(opacity: 0.85, child: tile),
          ),
          childWhenDragging: Opacity(opacity: 0.3, child: tile),
          child: tile,
        ),
      ),
    );
  }

  /// The AI cover. Not draggable — the server always publishes it first
  /// (see the ordering note in drafts/[id]/publish), so its position isn't
  /// the seller's to change.
  Widget _aiCoverTile() => _photoTile(
        url: _aiCover!,
        onRemove: _removeAiCover,
        badge: 'Cover Photo',
      );

  Widget _photoTile({
    required String url,
    required VoidCallback onRemove,
    String? badge,
  }) {
    return SizedBox(
      width: _kTile,
      height: _kTile,
      child: Stack(
        fit: StackFit.expand,
        children: [
          _tileFrame(
            child: CachedNetworkImage(
              imageUrl: resolveAssetUrl(url),
              fit: BoxFit.cover,
              placeholder: (_, __) =>
                  Container(color: ModaireColors.tileImageBg),
              errorWidget: (_, failingUrl, err) {
                debugPrint('[create-listing] image failed $failingUrl: $err');
                return Container(
                  color: const Color(0xFFFEF2F2),
                  alignment: Alignment.center,
                  child: const Icon(
                    LucideIcons.imageOff,
                    color: Color(0xFFB91C1C),
                    size: 18,
                  ),
                );
              },
            ),
          ),
          if (badge != null)
            Positioned(
              left: 4,
              bottom: 4,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xCC4A3328),
                  borderRadius: BorderRadius.circular(100),
                ),
                child: Text(
                  badge,
                  style: GoogleFonts.jost(
                    fontSize: 8,
                    fontWeight: FontWeight.w600,
                    color: ModaireColors.cream,
                  ),
                ),
              ),
            ),
          Positioned(
            top: 4,
            right: 4,
            child: GestureDetector(
              onTap: onRemove,
              child: Container(
                width: 22,
                height: 22,
                decoration: const BoxDecoration(
                  color: Color(0xCC000000),
                  shape: BoxShape.circle,
                ),
                child: const Icon(LucideIcons.x, size: 14, color: Colors.white),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _uploadingTile() => _tileFrame(
        child: Container(
          color: ModaireColors.tileImageBg,
          alignment: Alignment.center,
          child: const SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: ModaireColors.espresso,
            ),
          ),
        ),
      );

  Widget _addTile() => GestureDetector(
        onTap: _addPhotos,
        child: Container(
          width: _kTile,
          height: _kTile,
          decoration: BoxDecoration(
            color: const Color(0xFFFBF9F6),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFFCFB79F)),
          ),
          child: const Icon(
            LucideIcons.plus,
            size: 22,
            color: ModaireColors.tileTextSubtle,
          ),
        ),
      );


  Widget _modelPicker() {
    return SizedBox(
      height: 188,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _kSkinTones.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final opt = _kSkinTones[i];
          final selected = _modelSkinTone == opt.value;
          return GestureDetector(
            onTap: () => setState(() => _modelSkinTone = opt.value),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 110,
                  height: 162,
                  decoration: BoxDecoration(
                    color: Color(opt.swatch),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: selected
                          ? ModaireColors.espresso
                          : ModaireColors.pillBorder,
                      width: selected ? 2 : 1,
                    ),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: CachedNetworkImage(
                    imageUrl: opt.thumbnail,
                    fit: BoxFit.cover,
                    placeholder: (_, __) => Container(color: Color(opt.swatch)),
                    errorWidget: (_, __, ___) =>
                        Container(color: Color(opt.swatch)),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Model ${i + 1}',
                  style: GoogleFonts.jost(
                    fontSize: 12,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                    color: ModaireColors.espresso,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _hijabToggle() {
    return Row(
      children: [
        _hijabPill('Yes', true),
        const SizedBox(width: 10),
        _hijabPill('No', false),
      ],
    );
  }

  Widget _hijabPill(String label, bool value) {
    final selected = _hijabRequired == value;
    return GestureDetector(
      onTap: () => setState(() => _hijabRequired = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? ModaireColors.sellerCardBg : ModaireColors.pillBg,
          borderRadius: BorderRadius.circular(99),
          border: Border.all(
            color: selected ? ModaireColors.espresso : ModaireColors.pillBorder,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Text(
          label,
          style: GoogleFonts.jost(
            fontSize: 13,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
            color: ModaireColors.tileTextPrimary,
          ),
        ),
      ),
    );
  }


  /// Tiny letter-spaced caps label that sits above every pill input —
  /// mirrors the website's "TITLE *", "STYLE *", etc.
  Widget _fieldLabel(String label, {bool required = false}) {
    return RichText(
      text: TextSpan(
        text: label,
        style: GoogleFonts.jost(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          letterSpacing: 2.0,
          color: const Color(0xFF8A7667),
        ),
        children: required
            ? [
                TextSpan(
                  text: ' *',
                  style: GoogleFonts.jost(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFFB91C1C),
                  ),
                ),
              ]
            : const [],
      ),
    );
  }

  /// Top intro card — serif "Create Listing" header + helpful copy,
  /// matching the website's mobile mockup. Soft cream-on-cream inset.
  Widget _introCard() {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFFBF6F0),
        border: Border.all(color: const Color(0xFFE3D9D1)),
        borderRadius: BorderRadius.circular(20),
      ),
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Create Listing',
            style: GoogleFonts.cormorantGaramond(
              fontSize: 28,
              fontWeight: FontWeight.w600,
              height: 1.05,
              color: const Color(0xFF2F2925),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'If possible, make your first photo a shot of the model wearing the '
            'article from the website OR a full-length photo of you wearing the '
            'article.',
            style: GoogleFonts.jost(
              fontSize: 13.5,
              height: 1.5,
              color: const Color(0xFF6F6054),
            ),
          ),
        ],
      ),
    );
  }

  /// Create Styled Preview — nested bordered card with sparkle icon
  /// header, body copy, hairline divider, CHOOSE MODEL picker, HIJAB
  /// pills, and the espresso CREATE PREVIEW CTA. Mirrors the website's
  /// SellPageClient preview block.
  Widget _styledPreviewCard() {
    final inFlight = _aiInFlight;
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFFBF8F5),
        border: Border.all(color: const Color(0xFFE3D9D1)),
        borderRadius: BorderRadius.circular(22),
      ),
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 2, right: 10),
                child: Icon(
                  LucideIcons.sparkle,
                  size: 18,
                  color: const Color(0xFF7A5A45),
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Create Styled Preview',
                      style: GoogleFonts.jost(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: const Color(0xFF2F2925),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Create a studio-quality preview from your uploaded photos. '
                      'Takes 2–4 minutes. Limit: 1 preview per listing.',
                      style: GoogleFonts.jost(
                        fontSize: 13,
                        height: 1.45,
                        color: const Color(0xFF6F6054),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Divider(height: 1, color: Color(0xFFE3D9D1)),
          const SizedBox(height: 16),
          _fieldLabel('CHOOSE MODEL'),
          const SizedBox(height: 10),
          _modelPicker(),
          const SizedBox(height: 18),
          const Divider(height: 1, color: Color(0xFFE3D9D1)),
          const SizedBox(height: 14),
          _fieldLabel('HIJAB'),
          const SizedBox(height: 10),
          _hijabToggle(),
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton.icon(
              onPressed: inFlight ? null : _generateAICover,
              icon: inFlight
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(LucideIcons.sparkle,
                      size: 16, color: Colors.white),
              label: Text(
                inFlight
                    ? 'Generating · ${_aiStatus.toLowerCase()}…'
                    : 'CREATE PREVIEW',
                style: GoogleFonts.jost(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.4,
                  color: Colors.white,
                ),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF4A3328),
                foregroundColor: Colors.white,
                disabledBackgroundColor: const Color(0xFFB3A698),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Soft pill text input — cream fill, hairline border, placeholder-only
  /// label (the section label widget above sits above each one).
  Widget _textField(
    TextEditingController controller,
    String hint, {
    bool required = false,
    TextInputType? keyboardType,
    int maxLines = 1,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      maxLines: maxLines,
      textInputAction:
          maxLines > 1 ? TextInputAction.newline : TextInputAction.next,
      style: GoogleFonts.jost(
        fontSize: 15,
        color: const Color(0xFF2F2925),
      ),
      decoration: _pillDecoration(hint),
      validator: validator ??
          (required
              ? (v) => (v == null || v.trim().isEmpty) ? 'Required' : null
              : null),
    );
  }

  /// Soft pill dropdown — same styling as [_textField] so the field
  /// row reads as a uniform grid of inputs.
  Widget _dropdown(
    String hint,
    List<String> values,
    String? selected,
    ValueChanged<String?> onChanged, {
    bool required = false,
  }) {
    return DropdownButtonFormField<String>(
      initialValue: selected,
      isExpanded: true,
      icon: const Icon(LucideIcons.chevronsUpDown,
          size: 16, color: Color(0xFF8A7667)),
      hint: Text(
        hint,
        style: GoogleFonts.jost(
          fontSize: 15,
          color: const Color(0xFF8A7667),
        ),
      ),
      style: GoogleFonts.jost(
        fontSize: 15,
        color: const Color(0xFF2F2925),
      ),
      decoration: _pillDecoration(null),
      items: values
          .map(
            (v) => DropdownMenuItem(
              value: v,
              child: Text(
                v,
                style: GoogleFonts.jost(
                  fontSize: 15,
                  color: const Color(0xFF2F2925),
                ),
              ),
            ),
          )
          .toList(),
      onChanged: onChanged,
      validator: required ? (v) => v == null ? 'Required' : null : null,
    );
  }

  InputDecoration _pillDecoration(String? hint) {
    OutlineInputBorder border([Color color = const Color(0xFFD9CFC7)]) =>
        OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: color),
        );
    return InputDecoration(
      hintText: hint,
      hintStyle: GoogleFonts.jost(
        fontSize: 15,
        color: const Color(0xFF8A7667),
      ),
      isDense: true,
      filled: true,
      fillColor: const Color(0xFFFBF6F0),
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: border(),
      enabledBorder: border(),
      focusedBorder: border(const Color(0xFF4A3328)),
      errorBorder: border(const Color(0xFFB91C1C)),
      focusedErrorBorder: border(const Color(0xFFB91C1C)),
      errorStyle: GoogleFonts.jost(
        fontSize: 11,
        color: const Color(0xFFB91C1C),
      ),
    );
  }
}
