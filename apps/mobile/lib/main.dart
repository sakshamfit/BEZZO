import 'package:flutter/material.dart';

import 'app.dart';
import 'features/demo/presentation/demo_showcase_app.dart';

const _demoMode = bool.fromEnvironment('BEZZO_DEMO_MODE', defaultValue: false);

void main() => runApp(_demoMode ? const DemoShowcaseApp() : const BezzoApp());
