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
const path = require('path');
const shell = require('shelljs');
const fs = require('fs');
const util = require('util');

// Constants
const CHANGE_LOG_PATH = path.join(
  process.cwd(),
  'packages',
  'salesforcedx-vscode',
  'CHANGELOG.md'
);
const CHANGE_LOG_BRANCH = 'changeLog-v';

// Commit Map Keys
const PR_NUM = 'PR_NUM';
const COMMIT = 'COMMIT';
const MESSAGE = 'MESSAGE';
const FILES_CHANGED = 'FILES_CHANGED';
const PACKAGES = 'PACKAGES';

// Regex
const RELEASE_REGEX = new RegExp(/^origin\/release\/v\d{2}\.\d{1,2}\.\d/);
const PR_REGEX = new RegExp(/(\(#\d+\))/);
const COMMIT_REGEX = new RegExp(/^([\da-zA-Z]+)/);

/**
 * Returns a list of remote release branches, sorted in reverse order by
 * creation date. This ensures that the first entry is the latest branch.
 */
function getReleaseBranches() {
  if (ADD_VERBOSE_LOGGING) {
    console.log('Retrieving release branches.');
    console.log("git branch -r -l --sort='-creatordate' 'origin/release/v*'");
  }
  return shell
    .exec("git branch -r -l --sort='-creatordate' 'origin/release/v*'", {
      silent: !ADD_VERBOSE_LOGGING
    })
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
      ? 'origin/release/v' + process.argv[releaseIndex + 1]
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
  if (!(releaseBranch && RELEASE_REGEX.exec(releaseBranch))) {
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
  var changeLogBranch =
    CHANGE_LOG_BRANCH + releaseBranch.replace('origin/release/v', '');
  var command = util.format(
    "git checkout $(git show-ref --verify --quiet refs/heads/%s || echo '-b') %s",
    changeLogBranch,
    changeLogBranch,
    releaseBranch
  );
  if (ADD_VERBOSE_LOGGING) {
    console.log('Generating change log branch.');
    console.log(command);
  }
  shell.exec(command);
}

/**
 * This command will list all commits that are different between
 * the two branches. Therefore, we are guaranteed to get all new
 * commits relevant only to the new branch.
 */
function getCommits(releaseBranch, previousBranch) {
  if (ADD_VERBOSE_LOGGING) console.log('\nCommits:');
  var commits = shell
    .exec(
      util.format(
        'git log --cherry-pick --oneline %s...%s',
        releaseBranch,
        previousBranch
      ),
      {
        silent: !ADD_VERBOSE_LOGGING
      }
    )
    .stdout.trim()
    .split('\n');
  return commits;
}

/**
 * Parse the commits and return them as a list of hashmaps.
 */
function parseCommits(commits) {
  if (ADD_VERBOSE_LOGGING) console.log('\nCommit Parsing Results...');
  var commitMaps = [];
  for (var i = 0; i < commits.length; i++) {
    var commitMap = buildMapFromCommit(commits[i]);
    if (commitMap && Object.keys(commitMap).length > 0) {
      commitMaps.push(commitMap);
    }
  }
  return filterExistingPREntries(commitMaps);
}

function buildMapFromCommit(commit) {
  var map = {};
  if (commit) {
    var pr = PR_REGEX.exec(commit);
    var commitNum = COMMIT_REGEX.exec(commit);
    if (pr && commitNum) {
      var message = commit.replace(commitNum[0], '').replace(pr[0], '');
      map[PR_NUM] = pr[0].replace(/[^\d]/g, '');
      map[COMMIT] = commitNum[0];
      map[MESSAGE] = message.trim();
      map[FILES_CHANGED] = getFilesChanged(map[COMMIT]);
      map[PACKAGES] = getPackageHeaders(map[FILES_CHANGED]);
    }
  }
  if (ADD_VERBOSE_LOGGING) {
    console.log('\nCommit: ' + commit);
    console.log('Commit Map:');
    console.log(map);
  }
  return map;
}

function getFilesChanged(commitNumber) {
  return shell
    .exec('git show --pretty="" --name-only ' + commitNumber, {
      silent: !ADD_VERBOSE_LOGGING
    })
    .stdout.trim()
    .toString()
    .replace(/\n/g, ',');
}

function getPackageHeaders(filesChanged) {
  var packageHeaders = new Set();
  filesChanged.split(',').forEach(function(filePath) {
    var packageName = getPackageName(filePath);
    if (packageName) {
      packageHeaders.add(packageName);
    }
  });
  return filterPackageNames(packageHeaders);
}

function getPackageName(filePath) {
  if (
    filePath &&
    !filePath.includes('/images/') &&
    !filePath.includes('/test/')
  ) {
    var packageName = filePath.replace('packages/', '').split('/')[0];
    return packageName.startsWith('salesforce') ||
      packageName.startsWith('docs')
      ? packageName
      : null;
  }
  return null;
}

function filterPackageNames(packageHeaders) {
  var filteredHeaders = new Set(packageHeaders);
  if (packageHeaders.has('salesforcedx-vscode-core')) {
    packageHeaders.forEach(function(packageName) {
      if (packageName != 'salesforcedx-vscode-core' && packageName != 'docs') {
        filteredHeaders.delete(packageName);
      }
    });
  }
  return filteredHeaders;
}

function filterExistingPREntries(parsedCommits) {
  var currentChangeLog = fs.readFileSync(CHANGE_LOG_PATH);
  var filteredResults = [];
  parsedCommits.forEach(function(map) {
    if (!currentChangeLog.includes('PR #' + map[PR_NUM])) {
      filteredResults.push(map);
    } else if (ADD_VERBOSE_LOGGING) {
      console.log(
        '\n' +
          util.format(
            'Filtered PR number %s. An entry already exists in the changelog.',
            map[PR_NUM]
          )
      );
    }
  });
  return filteredResults;
}

/**
 * Groups all messages per package header so they can be displayed under
 * the same package header subsection. Returns a map of lists.
 */
function getMessagesGroupedByPackage(parsedCommits) {
  var groupedMessages = {};
  parsedCommits.forEach(function(map) {
    map[PACKAGES].forEach(function(packageName) {
      groupedMessages[packageName] = groupedMessages[packageName] || [];
      groupedMessages[packageName].push(
        util.format(
          '\n- %s ([PR #%s](https://github.com/forcedotcom/salesforcedx-vscode/pull/%s))\n',
          map[MESSAGE],
          map[PR_NUM],
          map[PR_NUM]
        )
      );
    });
  });
  if (ADD_VERBOSE_LOGGING) {
    console.log('\nMessages grouped by package:');
    console.log(groupedMessages);
  }
  return groupedMessages;
}

function writeChangeLog(textToInsert) {
  var data = fs.readFileSync(CHANGE_LOG_PATH);
  var fd = fs.openSync(CHANGE_LOG_PATH, 'w+');
  var buffer = Buffer.from(textToInsert.toString());
  fs.writeSync(fd, buffer, 0, buffer.length, 0);
  fs.writeSync(fd, data, 0, data.length, buffer.length);
  fs.closeSync(fd);
}

function getChangeLogHeader(releaseBranch) {
  var releaseBranchNum = releaseBranch
    .toString()
    .replace('origin/release/v', '');
  var currentChangeLog = fs.readFileSync(CHANGE_LOG_PATH);
  if (!currentChangeLog.includes(releaseBranchNum)) {
    return util.format(
      '# %s - (INSERT RELEASE DATE [Month Day, Year])\n' +
        '\n## Fixed\nMOVE ENTRIES FROM BELOW\n\n## Added\nMOVE ENTRIES FROM BELOW\n',
      releaseBranchNum
    );
  } else {
    return 'Additional Entry to Review for ' + releaseBranchNum + ':\n';
  }
}

function getChangeLogText(releaseBranch, groupedMessages) {
  var changeLogText = getChangeLogHeader(releaseBranch);
  Object.keys(groupedMessages).forEach(function(packageName) {
    changeLogText += util.format('\n#### %s\n', packageName);
    groupedMessages[packageName].forEach(function(message) {
      changeLogText += message;
    });
  });
  return changeLogText + '\n';
}

function writeAdditionalInfo() {
  console.log('\nChange log written to: ' + CHANGE_LOG_PATH + '\n');
  console.log('Next Steps:');
  console.log("  1) Remove entries that shouldn't be included in the release.");
  console.log('  2) Add documentation links as needed.');
  console.log(
    '     Format: [Doc Title](https://forcedotcom.github.io/salesforcedx-vscode/articles/doc-link-here)'
  );
  console.log("  3) Move entries to the 'Added' or 'Fixed' section header.");
  console.log('  4) Commit, push, and open your PR for team review.');
}

console.log("Starting script 'change-log-generator'\n");

let ADD_VERBOSE_LOGGING = process.argv.indexOf('-v') > -1 ? true : false;
var allReleaseBranches = getReleaseBranches();
var releaseBranch = getCurrentReleaseBranch(allReleaseBranches);
var previousBranch = getPreviousReleaseBranch(
  releaseBranch,
  allReleaseBranches
);
console.log(
  util.format(
    'Using Release Branch: %s and Previous Release Branch: %s\n',
    releaseBranch,
    previousBranch
  )
);
getNewChangeLogBranch(releaseBranch);

var parsedCommits = parseCommits(getCommits(releaseBranch));
var groupedMessages = getMessagesGroupedByPackage(parsedCommits);
var changeLog = getChangeLogText(releaseBranch, groupedMessages);
writeChangeLog(changeLog);
writeAdditionalInfo();
