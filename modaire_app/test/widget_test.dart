import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:modaire_app/app/app.dart';

void main() {
  testWidgets('App boots and renders the Modaire wordmark', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: ModaireApp()),
    );
    // pumpAndSettle hangs on GoogleFonts background HTTP — pump enough frames
    // for first paint instead.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // Wordmark appears on every gated screen (splash, sign-in, home).
    expect(find.text('Modaire'), findsWidgets);
  });
}
