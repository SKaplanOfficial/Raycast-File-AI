import { runAppleScript } from "run-applescript";
import { CommandOptions, ERRORTYPE, ExtensionPreferences } from "../utils/types";
import { useEffect, useState } from "react";
import { environment, getPreferenceValues } from "@raycast/api";
import { getMetadataDetails } from "../utils/file-utils";
import path from "path";
import * as fs from "fs";
import {
  audioFileExtensions,
  imageFileExtensions,
  textFileExtensions,
  videoFileExtensions,
} from "../utils/file-extensions";
import { filterString } from "../utils/calendar-utils";
import { execScript } from "../utils/scripts";
import { getAudioDetails, getAudioTranscription } from "../utils/audio-utils";
import { getFileExifData, getImageDetails, getPDFText } from "../utils/image-utils";

export const getSelectedFiles = async (): Promise<{ paths: string[]; csv: string }> => {
  const res = await runAppleScript(`tell application "Finder"
        set oldDelimiters to AppleScript's text item delimiters
        set AppleScript's text item delimiters to "::"
        set theSelection to selection
        if theSelection is {} then
            return
        else if (theSelection count) is equal to 1 then
            return the POSIX path of (theSelection as alias)
        else
            set thePaths to {}
            repeat with i from 1 to (theSelection count)
                copy (POSIX path of (item i of theSelection as alias)) to end of thePaths
            end repeat
            set thePathsString to thePaths as text
            set AppleScript's text item delimiters to oldDelimiters
            return thePathsString
        end if
    end tell`);
  const paths = res.split("::");
  const csv = paths.join(",");
  return { paths, csv };
};

/**
 * The maximum length of a file's read content string. This value is divided across all selected files.
 */
let maxCharacters = (() => {
  const preferences = getPreferenceValues<ExtensionPreferences>();
  return parseInt(preferences.lengthLimit) || 2500;
})();

const isDotFile = (filepath: string) => {
  return path.basename(filepath).startsWith(".");
};

const isTrueDirectory = (filepath: string) => {
  return fs.lstatSync(filepath).isDirectory() && !isApp(filepath);
};

const isApp = (filepath: string) => {
  return path.extname(filepath).toLowerCase() === ".app";
};

const isPDF = (filepath: string) => {
  return path.extname(filepath).toLowerCase() === ".pdf";
};

const isVideoFile = (filepath: string) => {
  return videoFileExtensions.includes(path.extname(filepath).slice(1).toLowerCase());
};

const isAudioFile = (filepath: string) => {
  return audioFileExtensions.includes(path.extname(filepath).slice(1).toLowerCase());
};

const isImageFile = (filepath: string) => {
  return imageFileExtensions.includes(path.extname(filepath).slice(1).toLowerCase());
};

const isTextFile = (filepath: string) => {
  return (
    textFileExtensions.includes(path.extname(filepath).slice(1).toLowerCase()) || path.extname(filepath).toLowerCase() === ""
  );
};

export const useFiles = (options: CommandOptions) => {
  const [selectedFiles, setSelectedFiles] = useState<{ paths: string[]; csv: string }>();
  const [fileContents, setFileContents] = useState<{ [key: string]: string, contents: string }>();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<number>();

  const loadSelection = async () => {
    const validExtensions = (options.acceptedFileExtensions || []).map((ext) => ext.toLowerCase());

    setIsLoading(true);
    const rawSelection = await getSelectedFiles();

    // Remove invalid files and directories from the selection
    const selection = rawSelection.paths.reduce(
      (acc, filepath) => {
        if (
          validExtensions.length == 0 ||
          !isDotFile(filepath) ||
          validExtensions.includes(path.extname(filepath).slice(1).toLowerCase())
        ) {
          return { paths: [...acc.paths, filepath], csv: acc.csv + "," + filepath };
        }
        return acc;
      },
      { paths: [] as string[], csv: "" }
    );

    maxCharacters = maxCharacters / selection.paths.length;
    setSelectedFiles(selection);
    return selection;
  };

  const loadFileContents = async (selection: { paths: string[]; csv: string }) => {
    // Raise an error if too few files are selected
    if (selection.paths.length < (options.minNumFiles || 1)) {
      setError(ERRORTYPE.MIN_SELECTION_NOT_MET);
      setIsLoading(false);
      return;
    }

    const fileData: { [key: string]: string; contents: string } = {
      contents: "",
    };
    for (const [index, filepath] of selection.paths.entries()) {
      // Init. file contents with file name as header
      const currentData = { contents: `{File ${index + 1} - ${path.basename(filepath)}}:\n` };

      // If the file is too large, just return the metadata
      if (
        fs.lstatSync(filepath).size > 10000000 &&
        !videoFileExtensions.includes(path.extname(filepath).slice(1).toLowerCase())
      ) {
        currentData.contents += filterString(getMetadataDetails(filepath));
        fileData.contents += currentData.contents;
        continue;
      }

      if (isTrueDirectory(filepath)) addDirectoryDetails(filepath, currentData);
      else if (isApp(filepath)) await addAppDetails(filepath, currentData, options);
      else if (isPDF(filepath)) await addPDFDetails(filepath, currentData, options);
      else if (isVideoFile(filepath)) await addVideoDetails(filepath, currentData, options);
      else if (isAudioFile(filepath)) await addAudioDetails(filepath, currentData, options);
      else if (isImageFile(filepath)) await addImageDetails(filepath, currentData, options);
      else if (isTextFile(filepath)) addTextFileDetails(filepath, currentData);
      else attemptAddRawText(filepath, currentData);

      if (options.useMetadata) addMetadataDetails(filepath, currentData);

      currentData.contents = fileData.contents + currentData.contents;
      Object.assign(fileData, currentData);
    }

    setFileContents(fileData);
  };

  const revalidate = async () => {
    Promise.resolve(loadSelection()).then((selection) => {
      Promise.resolve(
        loadFileContents(selection).then(() => {
          setIsLoading(false);
        })
      );
    });
  };

  useEffect(() => {
    revalidate();
  }, []);

  return { selectedFiles, fileContents, isLoading, error, revalidate };
};

const addDirectoryDetails = (filepath: string, currentData: { [key: string]: string; contents: string }) => {
  const children = fs.readdirSync(filepath);
  currentData.contents += `This is a folder containing the following files: ${children.join(", ")}`;
};

const addAppDetails = async (
  filepath: string,
  currentData: { [key: string]: string; contents: string },
  options: CommandOptions
) => {
  /* Gets the metadata, plist, and scripting dictionary information about an application (.app). */
  let appDetails = "";

  // Include plist information
  const plist = filterString(
    (
      await runAppleScript(`use framework "Foundation"
  set theURL to current application's NSURL's fileURLWithPath:"${filepath}Contents/Info.plist"
  set theDict to current application's NSDictionary's dictionaryWithContentsOfURL:theURL |error|:(missing value)
  return theDict's |description|() as text`)
    ).replaceAll(/\s+/g, " "),
    maxCharacters / 2
  );

  // Include general application-focused instructions
  if (options.useMetadata) {
    appDetails += `<Plist info for this app: ###${plist}###>`;
  }

  // Include relevant child files
  const children = fs.readdirSync(`${filepath}Contents/Resources`);
  children.forEach((child) => {
    if (child.toLowerCase().endsWith("sdef")) {
      // Include scripting dictionary information & associated instruction
      const sdef = fs.readFileSync(`${filepath}Contents/Resources/${child}`).toString();
      appDetails += `AppleScript Scripting Dictionary: ###${filterString(sdef, maxCharacters / 2)}###`;
    }
  });
  return appDetails;
};

const addPDFDetails = async (
  filepath: string,
  currentData: { [key: string]: string; contents: string },
  options: CommandOptions
) => {
  const preferences = getPreferenceValues<ExtensionPreferences>();
  const pdfText = await getPDFText(filepath, preferences.pdfOCR, 3, options);
  currentData.contents += filterString(pdfText.imageText);
  currentData["pdfRawText"] = filterString(pdfText.pdfRawText);
  currentData["pdfOCRText"] = filterString(pdfText.pdfOCRText);
};

const addVideoDetails = async (
  filepath: string,
  currentData: { [key: string]: string; contents: string },
  options: CommandOptions
) => {
  const videoFeatureExtractor = path.resolve(environment.assetsPath, "scripts", "VideoFeatureExtractor.scpt");
  const videoDetails = filterString(
    await execScript(
      videoFeatureExtractor,
      [
        `"${filepath}"`,
        options.useAudioDetails || false,
        options.useSubjectClassification || false,
        options.useFaceDetection || false,
        options.useRectangleDetection || false,
      ],
      "JavaScript"
    ).data
  );
  currentData.contents += videoDetails;
};

const addAudioDetails = async (
  filepath: string,
  currentData: { [key: string]: string; contents: string },
  options: CommandOptions
) => {
  if (options.useAudioDetails) {
    const transcription = await getAudioTranscription(filepath, maxCharacters);
    const audioDetails = filterString(transcription);
    currentData.contents += `<Spoken audio: """${audioDetails}"""`;
    currentData["audioTranscription"] = audioDetails;
  } else if (options.useSubjectClassification) {
    const audioClassifications = await getAudioDetails(filepath);
    currentData.contents += audioClassifications.contents;
    currentData["soundClassifications"] = audioClassifications.soundClassifications;
  }
};

const addImageDetails = async (
  filepath: string,
  currentData: { [key: string]: string; contents: string },
  options: CommandOptions
) => {
  const imageDetails = await getImageDetails(filepath, options);
  const imageVisionInstructions = filterString(imageDetails.output);
  const exifData = options.useMetadata ? filterString(await getFileExifData(filepath)) : ``;
  const exifInstruction = options.useMetadata ? `<EXIF data: ###${exifData}###>` : ``;
  currentData.contents += imageVisionInstructions + exifInstruction;
  Object.assign(currentData, imageDetails);
};

const addTextFileDetails = (filepath: string, currentData: { [key: string]: string; contents: string }) => {
  try {
    if (fs.lstatSync(filepath).size > 10000000) return;
    const rawText = fs.readFileSync(filepath, "utf8");
    const text = filterString(rawText);
    const instruction = `\n<Text of the file: ###${text}###>`;
    currentData.contents += instruction;
  } catch (err) {
    console.error(err);
  }
};

const attemptAddRawText = (filepath: string, currentData: { [key: string]: string; contents: string }) => {
  try {
    if (fs.lstatSync(filepath).size > 10000000) return;
    const rawText = fs.readFileSync(filepath, "utf8");
    const text = filterString(rawText);
    const instruction = `\n<Raw text of the file: ###${text}###>`;
    currentData.contents += instruction;
  } catch (err) {
    console.error(err);
  }
};

const addMetadataDetails = (filepath: string, currentData: { [key: string]: string; contents: string }) => {
  const rawMetadata = JSON.stringify(fs.lstatSync(filepath));
  const metadata = filterString(rawMetadata);
  const instruction = `\n<Metadata of the file: ###${metadata}###>`;
  currentData.contents += instruction;
};