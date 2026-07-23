import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceAndroid = join(projectRoot, 'android')
const temporaryRoot = mkdtempSync(join(tmpdir(), 'high-timeline-android-'))
const temporaryAndroid = join(temporaryRoot, 'android')
const capacitorAndroid = join(dirname(require.resolve('@capacitor/android/package.json')), 'capacitor')

cpSync(sourceAndroid, temporaryAndroid, {
  recursive: true,
  filter(source) {
    const relative = source.slice(sourceAndroid.length).replaceAll('\\', '/')
    const name = source.split(/[\\/]/).at(-1) ?? ''
    return !name.startsWith('._') && !relative.includes('/build/') && !relative.includes('/.gradle/')
  },
})

const settingsPath = join(temporaryAndroid, 'capacitor.settings.gradle')
const settings = readFileSync(settingsPath, 'utf8').replace(
  /project\(':capacitor-android'\)\.projectDir = new File\('.*?'\)/,
  `project(':capacitor-android').projectDir = new File('${capacitorAndroid.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}')`,
)
writeFileSync(settingsPath, settings)

const bundledJava = '/Applications/Android Studio.app/Contents/jbr/Contents/Home'
const javaHome = process.env.JAVA_HOME || (existsSync(bundledJava) ? bundledJava : undefined)
const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(), 'Library', 'Android', 'sdk')
const defaultGradleHome = process.platform === 'win32' ? join(tmpdir(), 'high-timeline-gradle') : '/tmp/high-timeline-gradle'
const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
const result = spawnSync(gradle, ['assembleDebug', '--no-daemon'], {
  cwd: temporaryAndroid,
  env: {
    ...process.env,
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
    ANDROID_HOME: androidHome,
    ANDROID_SDK_ROOT: androidHome,
    GRADLE_USER_HOME: process.env.GRADLE_USER_HOME || defaultGradleHome,
  },
  stdio: 'inherit',
})

if (result.status !== 0) process.exit(result.status ?? 1)

const sourceApk = join(temporaryAndroid, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
const artifactDirectory = join(projectRoot, 'artifacts', 'android')
const artifactApk = join(artifactDirectory, 'high-timeline-debug.apk')
mkdirSync(artifactDirectory, { recursive: true })
cpSync(sourceApk, artifactApk)
console.log(`\nAPK ready: ${artifactApk}`)
