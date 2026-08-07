import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router.dart';
import 'theme.dart';

class ModaireApp extends ConsumerWidget {
  const ModaireApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(goRouterProvider);
    return MaterialApp.router(
      title: 'Modaire',
      debugShowCheckedModeBanner: false,
      theme: buildModaireTheme(),
      routerConfig: router,
    );
  }
}
