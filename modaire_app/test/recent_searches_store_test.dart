import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:modaire_app/core/search/recent_searches_store.dart';

/// The only non-widget logic in the search work, and the part with rules that
/// are easy to regress: ordering, case-insensitive dedupe, and the cap.
Future<RecentSearchesStore> newStore([List<String>? seed]) async {
  SharedPreferences.setMockInitialValues(
    seed == null ? {} : {'modaire.recent_searches': seed},
  );
  return RecentSearchesStore(await SharedPreferences.getInstance());
}

void main() {
  test('starts empty', () async {
    expect((await newStore()).read(), isEmpty);
  });

  test('most recent first', () async {
    final store = await newStore();
    await store.record('kaftan');
    await store.record('saree');
    expect(store.read(), ['saree', 'kaftan']);
  });

  test('re-recording promotes rather than duplicates', () async {
    final store = await newStore();
    await store.record('kaftan');
    await store.record('saree');
    await store.record('kaftan');
    expect(store.read(), ['kaftan', 'saree']);
  });

  test('dedupes case-insensitively, keeping the newest casing', () async {
    final store = await newStore();
    await store.record('Kaftan');
    await store.record('kaftan');
    expect(store.read(), ['kaftan']);
  });

  test('trims, and ignores whitespace-only queries', () async {
    final store = await newStore();
    await store.record('  kaftan  ');
    await store.record('   ');
    expect(store.read(), ['kaftan']);
  });

  test('caps at 8, dropping the oldest', () async {
    final store = await newStore();
    for (var i = 1; i <= 10; i++) {
      await store.record('q$i');
    }
    final result = store.read();
    expect(result.length, 8);
    expect(result.first, 'q10');
    expect(result.contains('q1'), isFalse);
    expect(result.contains('q2'), isFalse);
  });

  test('truncates to the server\'s 120-char limit', () async {
    final store = await newStore();
    await store.record('x' * 200);
    expect(store.read().single.length, 120);
  });

  test('remove is case-insensitive', () async {
    final store = await newStore(['Kaftan', 'saree']);
    await store.remove('kaftan');
    expect(store.read(), ['saree']);
  });

  test('clear empties the list', () async {
    final store = await newStore(['kaftan', 'saree']);
    await store.clear();
    expect(store.read(), isEmpty);
  });
}
