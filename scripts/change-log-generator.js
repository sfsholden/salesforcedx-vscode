/*
 * Automates the process of building the change log for releases.
 *
 * Assumptions:
 * 1. You have shelljs installed globally using `npm install -g shelljs`.
 * 2. The release branch in question has already been cut.
 *
 * This does not currently take into consideration:
 * 1. External contributions
 * 2. Duplicates (ex file changes made in both salesforcedx-apex-debugger and salesforcedx-apex-replay-debugger)
 * 3. Non-salesforce package contributions aside from doc updates
 * 4. Adding vs. Fixed vs. Ignore in change log
 *
 * Overriding Default Values:
 * 1. Override the release. Example: npm run build-change-log -- -r 46.7.0
 * 2. Add verbose logging. Example: npm run build-change-log -- -v
 */

const process = require('process');
const shell = require('shelljs');
const fs = require('fs');
const util = require('util');
const constants = require('./change-log-constants');
const { getChangeLogText } = require('./change-log-parse-util');

/**
 * Returns a list of remote release branches, sorted in reverse order by
 * creation date. This ensures that the first entry is the latest branch.
 */
function getReleaseBranches() {
  if (ADD_VERBOSE_LOGGING) {
    console.log('Retrieving release branches.');
  }
  return shell
    .exec(
      `git branch -r -l --sort='-creatordate' '${
        constants.RELEASE_BRANCH_PREFIX
      }*'`,
      { silent: !ADD_VERBOSE_LOGGING }
    )
    .replace(/\n/g, ',')
    .split(',')
    .map(Function.prototype.call, String.prototype.trim);
}

/**
 * Checks if the user has provided a release branch override. If they
 * have not, returns the latest release branch.
 */
function getCurrentReleaseBranch(releaseBranches) {
  var releaseIndex = process.argv.indexOf('-r');
  var releaseBranch =
    releaseIndex > -1
      ? constants.RELEASE_BRANCH_PREFIX + process.argv[releaseIndex + 1]
      : releaseBranches[0];
  validateReleaseBranch(releaseBranch);
  return releaseBranch;
}

function getPreviousReleaseBranch(curReleaseBranch, releaseBranches) {
  var index = releaseBranches.indexOf(curReleaseBranch);
  if (index != -1 && index + 1 < releaseBranches.length) {
    return releaseBranches[index + 1];
  } else {
    console.log('Unable to retrieve previous release. Exiting.');
    process.exit(-1);
  }
}

function validateReleaseBranch(releaseBranch) {
  if (!(releaseBranch && constants.RELEASE_REGEX.exec(releaseBranch))) {
    console.log(
      "Invalid release '" + releaseBranch + "'. Expected format [xx.yy.z]."
    );
    process.exit(-1);
  }
}

/**
 * Create the changelog branch for committing these changes.
 * If the branch already exists, check it out to append any
 * new changes.
 */
function getNewChangeLogBranch(releaseBranch) {
  var changeLogBranch = getChangeLogBranch(releaseBranch);
  if (ADD_VERBOSE_LOGGING) {
    console.log('Generating change log branch.');
  }
  shell.exec(`git fetch upstream ${releaseBranch}`);
  shell.exec(
    `git checkout $(git show-ref --verify --quiet refs/heads/${changeLogBranch} || echo '-b') ${changeLogBranch} ${releaseBranch}`
  );
}

function writeChangeLog(textToInsert) {
  if (!textToInsert) {
    console.log('Change results were empty.');
    shell.exit();
  }
  var data = fs.readFileSync(constants.CHANGE_LOG_PATH);
  var fd = fs.openSync(constants.CHANGE_LOG_PATH, 'w+');
  var buffer = Buffer.from(textToInsert.toString());
  fs.writeSync(fd, buffer, 0, buffer.length, 0);
  fs.writeSync(fd, data, 0, data.length, buffer.length);
  fs.closeSync(fd);
}

function openPRForChanges(releaseBranch) {
  var changeLogBranch = getChangeLogBranch(releaseBranch);
  var commitCommand =
    'git commit -a -m "Auto-Generated CHANGELOG for "' + releaseBranch;
  var pushCommand = 'git push origin ' + changeLogBranch;
  var pr = util.format(
    'git request-pull %s origin %s',
    releaseBranch,
    changeLogBranch
  );
  shell.exec(commitCommand);
  shell.exec(pushCommand, { silent: true });
  shell.exec(pr);
}

function writeAdditionalInfo() {
  console.log('\nChange log written to: ' + constants.CHANGE_LOG_PATH + '\n');
  console.log('Next Steps:');
  console.log("  1) Remove entries that shouldn't be included in the release.");
  console.log('  2) Add documentation links as needed.');
  console.log(
    '     Format: [Doc Title](https://forcedotcom.github.io/salesforcedx-vscode/articles/doc-link-here)'
  );
  console.log("  3) Move entries to the 'Added' or 'Fixed' section header.");
  console.log('  4) Commit, push, and open your PR for team review.');
}

function getChangeLogBranch(releaseBranch) {
  return (
    constants.CHANGE_LOG_BRANCH +
    releaseBranch.replace(constants.RELEASE_BRANCH_PREFIX, '')
  );
}

console.log("Starting script 'change-log-generator'\n");

if (process.argv.indexOf('-v') > -1) {
  shell.set('-v'); //Print command executions
}

let ADD_VERBOSE_LOGGING = process.argv.indexOf('-v') > -1 ? true : false;
var allReleaseBranches = getReleaseBranches();
var releaseBranch = getCurrentReleaseBranch(allReleaseBranches);
var previousBranch = getPreviousReleaseBranch(
  releaseBranch,
  allReleaseBranches
);
console.log(
  util.format(
    'Current Release Branch: %s\nPrevious Release Branch: %s\n',
    releaseBranch,
    previousBranch
  )
);
getNewChangeLogBranch(releaseBranch);
writeChangeLog(
  getChangeLogText(releaseBranch, previousBranch, ADD_VERBOSE_LOGGING)
);
openPRForChanges(releaseBranch);
writeAdditionalInfo();
