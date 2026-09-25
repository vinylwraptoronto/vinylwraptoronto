import { chromium } from 'playwright';

/** Launch the project browser on developer machines and in CI. */
export async function launchChromium(options = {}) {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (executablePath) return chromium.launch({ ...options, executablePath });

  try {
    return await chromium.launch(options);
  } catch (error) {
    if (!/Executable doesn't exist|browserType\.launch/i.test(String(error))) throw error;
    return chromium.launch({ ...options, channel: 'chrome' });
  }
}
