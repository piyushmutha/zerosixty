// Builds the signed release APK (or, with --bundle, the App Bundle Google Play takes) with the
// portable toolchain in D:/Android-toolchain and copies it to dist/. Override the locations with
// JAVA_HOME / ANDROID_HOME.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const toolchain = 'D:/Android-toolchain';
const env = {
  ...process.env,
  JAVA_HOME: process.env.JAVA_HOME || join(toolchain, 'jdk-21'),
  ANDROID_HOME: process.env.ANDROID_HOME || join(toolchain, 'sdk'),
  GRADLE_USER_HOME: process.env.GRADLE_USER_HOME || join(toolchain, 'gradle'),
};
env.PATH = `${join(env.JAVA_HOME, 'bin')};${env.PATH}`;

const bundle = process.argv.includes('--bundle');
const task = bundle ? 'bundleRelease' : 'assembleRelease';
const win = process.platform === 'win32';
const gradlew = join(process.cwd(), 'android', win ? 'gradlew.bat' : 'gradlew');
execFileSync(win ? 'cmd.exe' : gradlew, win ? ['/c', gradlew, task, '--console=plain'] : [task, '--console=plain'], { cwd: 'android', env, stdio: 'inherit' });

const built = bundle ? 'android/app/build/outputs/bundle/release/app-release.aab' : 'android/app/build/outputs/apk/release/app-release.apk';
const out = bundle ? 'dist/ZeroSixty.aab' : 'dist/ZeroSixty.apk';
if (!existsSync(built)) throw new Error(`No signed ${bundle ? 'bundle' : 'APK'} was produced. Is android/keystore.properties present?`);
mkdirSync('dist', { recursive: true });
cpSync(built, out);
console.log(`${bundle ? 'Bundle' : 'APK'} ready: ${out}`);
