import 'package:bezzo_mobile/core/lifecycle/foreground_refresh_observer.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('ForegroundRefreshObserver', () {
    test('refreshes on resume and unregisters when disposed', () {
      var refreshCount = 0;
      final observer = ForegroundRefreshObserver(
        onResumed: () => refreshCount++,
      );

      observer.attach();
      observer.didChangeAppLifecycleState(AppLifecycleState.inactive);
      observer.didChangeAppLifecycleState(AppLifecycleState.resumed);
      expect(refreshCount, 1);

      observer.dispose();
      observer.didChangeAppLifecycleState(AppLifecycleState.resumed);
      expect(refreshCount, 1);
    });

    test('attaching more than once registers only one observer', () {
      var refreshCount = 0;
      final observer = ForegroundRefreshObserver(
        onResumed: () => refreshCount++,
      );

      observer.attach();
      observer.attach();
      WidgetsBinding.instance.handleAppLifecycleStateChanged(
        AppLifecycleState.resumed,
      );

      expect(refreshCount, 1);
      observer.dispose();
    });
  });
}
