import { runAppleScript } from "run-applescript";
import {
  addFileToSelection,
  objcImports,
  replaceAllHandler,
  rselectHandler,
  splitHandler,
  trimHandler,
} from "./scripts";
import { filterString } from "./calendar-utils";
import { getTextOfWebpage } from "./context-utils";
import { exec } from "child_process";
import * as os from "os";
import { Command, StoreCommand } from "./types";
import { LocalStorage, unstable_AI } from "@raycast/api";

/**
 * Runs the action script of a PromptLab command, providing the AI response as the `response` variable.
 *
 * The following handlers are provided:
 *  - `split(theString, theDelimiter)` - Splits text around a delimiter
 *  - `trim(theString)` - Removes leading and trailing spaces from text
 *
 * The following AppleScriptObjC frameworks are supported and automatically imported: `AVFoundation`, `CoreLocation`, `CoreMedia`, `EventKit`, `Foundation`, `GamePlayKit`, `LatentSemanticMapping`, `MapKit`, `PDFKit`, `Photos`, `Quartz`, `SafariServices`, `ScreenCaptureKit`, `ScreenSaver`, `SoundAnalysis`, `Speech`, `Vision`, and `Webkit`
 *
 * @param script The AppleScript script to execute.
 * @param response The PromptLab AI response.
 */
export const runActionScript = async (script: string, prompt: string, input: string, response: string) => {
  try {
    await runAppleScript(`${objcImports}
    ${splitHandler}
    ${trimHandler}
    ${replaceAllHandler}
    ${rselectHandler}
    set prompt to "${prompt.replaceAll('"', '\\"')}"
    set input to "${input.replaceAll('"', '\\"')}"
    set response to "${response.replaceAll('"', '\\"')}"
    ${script}`);
  } catch (error) {
    console.error(error);
  }
};

/**
 * Replaces AppleScript placeholders with the output of the AppleScript.
 *
 * @param prompt The prompt to operate on.
 * @returns A promise resolving to the prompt with the `{{{...}}}` placeholders replaced.
 */
export const replaceOldAppleScriptPlaceholders = async (prompt: string) => {
  let subbedPrompt = prompt;
  const codeMatches = prompt.match(/{{{(.*?[\s\n\r]*)*?}}}/g) || [];
  for (const m of codeMatches) {
    const script = m.substring(3, m.length - 3);
    const output = await runAppleScript(script);
    subbedPrompt = filterString(subbedPrompt.replaceAll(m, output));
  }
  return subbedPrompt;
};

/**
 * Replaces AppleScript placeholders with the output of the AppleScript.
 *
 * @param prompt The prompt to operate on.
 * @returns A promise resolving to the prompt with the `{{as:...}}` placeholders replaced.
 */
export const replaceAppleScriptPlaceholders = async (prompt: string) => {
  let subbedPrompt = prompt;
  const applescriptMatches = prompt.match(/{{as:(.*?[\s\n\r]*)*?}}/g) || [];
  for (const m of applescriptMatches) {
    const script = m.substring(5, m.length - 2);
    const output = await runAppleScript(script);
    subbedPrompt = filterString(subbedPrompt.replaceAll(m, output));
  }
  return subbedPrompt;
};

/**
 * Replaces shell script placeholders with the output of the shell script.
 *
 * @param prompt The prompt to operate on.
 * @returns A promise resolving to the prompt with the `{{shell:...}}` placeholders replaced.
 */
export const replaceShellScriptPlaceholders = async (prompt: string) => {
  let subbedPrompt = prompt;
  const shellScriptMatches = prompt.match(/{{shell:(.*?[\s\n\r]*)*?}}/g) || [];
  for (const m of shellScriptMatches) {
    const script = m.substring(8, m.length - 2);

    const runScript = (script: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        exec(script, (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(stdout);
        });
      });
    };

    const output = await runScript(script);
    subbedPrompt = filterString(subbedPrompt.replaceAll(m, output));
  }
  return subbedPrompt;
};

/**
 * Replaces URL placeholders with the text of the webpage.
 *
 * @param prompt The prompt to operate on.
 * @returns A promise resolving to the prompt with the `{{url:...}}` placeholders replaced.
 */
export const replaceURLPlaceholders = async (prompt: string) => {
  let subbedPrompt = prompt;
  const urlMatches = prompt.match(/{{(https?:.*?)}}/g) || [];
  for (const m of urlMatches) {
    const url = m.substring(2, m.length - 2);
    const text = await getTextOfWebpage(url);
    subbedPrompt = subbedPrompt.replaceAll(m, filterString(text));
  }
  return subbedPrompt;
};

/**
 * Selects files specified by the `{{file:...}}` placeholder.
 *
 * @param prompt The prompt to operate on.
 * @returns A promise resolving to the prompt with the `{{file:...}}` placeholders removed.
 */
export const replaceFileSelectionPlaceholders = async (prompt: string) => {
  let subbedPrompt = prompt;
  const fileMatches = prompt.match(/{{file:[~/].*?}}/g) || [];
  for (const m of fileMatches) {
    const file = m.substring(7, m.length - 2).replace("~", os.homedir());
    addFileToSelection(file);
    subbedPrompt = subbedPrompt.replaceAll(m, "");
  }
  return subbedPrompt;
};

/**
 * Gets the importable JSON string representation of a command.
 *
 * @param command The command to get the JSON representation of.
 * @returns The JSON string representation of the command.
 */
export const getCommandJSON = (command: Command | StoreCommand) => {
  const cmdObj: { [key: string]: Command | StoreCommand } = {};
  cmdObj[command.name] = command;
  return JSON.stringify(cmdObj).replaceAll(/\\([^"])/g, "\\\\$1");
};

/**
 * Run placeholder replacements on a prompt.
 *
 * @param prompt The prompt to run replacements on.
 * @param replacements The list of replacements to run.
 * @param disallowedCommands The list of commands that are not allowed to be run in command placeholders.
 * @returns A promise resolving to the prompt with all placeholders replaced.
 */
export const runReplacements = async (
  prompt: string,
  replacements: {
    [key: string]: () => Promise<string>;
  },
  disallowedCommands: string[]
): Promise<string> => {
  // Replace simple placeholders (i.e. {{date}})
  let subbedPrompt = prompt;
  for (const key in replacements) {
    if (prompt.includes(key)) {
      subbedPrompt = subbedPrompt.replaceAll(key, await replacements[key]());
    }
  }

  // Replace complex placeholders (i.e. shell scripts, AppleScripts, etc.)
  subbedPrompt = await replaceOldAppleScriptPlaceholders(subbedPrompt);
  subbedPrompt = await replaceAppleScriptPlaceholders(subbedPrompt);
  subbedPrompt = await replaceShellScriptPlaceholders(subbedPrompt);
  subbedPrompt = await replaceURLPlaceholders(subbedPrompt);
  subbedPrompt = await replaceFileSelectionPlaceholders(subbedPrompt);

  // Replace command placeholders
  for (const cmdString of Object.values(await LocalStorage.allItems())) {
    const cmd = JSON.parse(cmdString) as Command;
    if (!disallowedCommands.includes(cmd.name) && subbedPrompt.includes(`{{${cmd.name}}}`)) {
      const cmdResponse = await unstable_AI.ask(
        await runReplacements(cmd.prompt, replacements, [cmd.name, ...disallowedCommands])
      );
      subbedPrompt = subbedPrompt.replaceAll(`{{${cmd.name}}}`, cmdResponse);
    }
  }

  return subbedPrompt;
};
