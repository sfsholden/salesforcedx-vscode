#!/usr/bin/env node

const shell = require('shelljs');
const fs = require('fs');
const util = require('util');
const constants = require('./change-log-constants');

module.exports = {
  getChangeLogText(releaseBranch, previousBranch, addLogging) {
    var groupedMessages = module.exports.getGroupedMessages(
      releaseBranch,
      previousBranch,
      addLogging
    );
    if (Object.keys(groupedMessages).length == 0) {
      return '';
    }
    var changeLogText = module.exports.getChangeLogHeader(releaseBranch);
    Object.keys(groupedMessages).forEach(function(packageName) {
      changeLogText += util.format('\n#### %s\n', packageName);
      groupedMessages[packageName].forEach(function(message) {
        changeLogText += message;
      });
    });
    return changeLogText + '\n';
  },

  getGroupedMessages(releaseBranch, previousBranch, addLogging) {
    var commits = module.exports.getCommits(
      releaseBranch,
      previousBranch,
      addLogging
    );
    var parsedCommits = module.exports.parseCommits(commits, addLogging);
    return module.exports.getMessagesGroupedByPackage(
      parsedCommits,
      addLogging
    );
  },

  /**
   * This command will list all commits that are different between
   * the two branches. Therefore, we are guaranteed to get all new
   * commits relevant only to the new branch.
   */
  getCommits(releaseBranch, previousBranch, addLogging) {
    if (addLogging) console.log('\nCommits:');
    var commits = shell
      .exec(
        util.format(
          'git log --cherry-pick --oneline %s...%s',
          releaseBranch,
          previousBranch
        ),
        {
          silent: !addLogging
        }
      )
      .stdout.trim()
      .split('\n');
    return commits;
  },

  /**
   * Parse the commits and return them as a list of hashmaps.
   */
  parseCommits(commits, addLogging) {
    if (addLogging) console.log('\nCommit Parsing Results...');
    var commitMaps = [];
    for (var i = 0; i < commits.length; i++) {
      var commitMap = module.exports.buildMapFromCommit(commits[i], addLogging);
      if (commitMap && Object.keys(commitMap).length > 0) {
        commitMaps.push(commitMap);
      }
    }
    return module.exports.filterExistingPREntries(commitMaps, addLogging);
  },

  buildMapFromCommit(commit, addLogging) {
    var map = {};
    if (commit) {
      var pr = constants.PR_REGEX.exec(commit);
      var commitNum = constants.COMMIT_REGEX.exec(commit);
      if (pr && commitNum) {
        var message = commit
          .replace(commitNum[0], '')
          .replace(pr[0], '')
          .trim();
        map = module.exports.buildMap(pr[0], commitNum[0], message);
      }
    }
    if (addLogging) {
      console.log('\nCommit: ' + commit);
      console.log('Commit Map:');
      console.log(map);
    }
    return map;
  },

  buildMap(pr, commitNum, message, addLogging) {
    var map = {};
    map[constants.PR_NUM] = pr.replace(/[^\d]/g, '');
    map[constants.COMMIT] = commitNum;
    map[constants.MESSAGE] = message;
    map[constants.FILES_CHANGED] = module.exports.getFilesChanged(
      map[constants.COMMIT],
      addLogging
    );
    map[constants.PACKAGES] = module.exports.getPackageHeaders(
      map[constants.FILES_CHANGED]
    );
    return map;
  },

  getFilesChanged(commitNumber, addLogging) {
    return shell
      .exec(`git show --pretty="" --name-only ${commitNumber}`, {
        silent: !addLogging
      })
      .stdout.trim()
      .toString()
      .replace(/\n/g, ',');
  },

  getPackageHeaders(filesChanged) {
    var packageHeaders = new Set();
    filesChanged.split(',').forEach(function(filePath) {
      var packageName = module.exports.getPackageName(filePath);
      if (packageName) {
        packageHeaders.add(packageName);
      }
    });
    return module.exports.filterPackageNames(packageHeaders);
  },

  getPackageName(filePath) {
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
  },

  filterPackageNames(packageHeaders) {
    var filteredHeaders = new Set(packageHeaders);
    if (packageHeaders.has('salesforcedx-vscode-core')) {
      packageHeaders.forEach(function(packageName) {
        if (
          packageName != 'salesforcedx-vscode-core' &&
          packageName != 'docs'
        ) {
          filteredHeaders.delete(packageName);
        }
      });
    }
    return filteredHeaders;
  },

  filterExistingPREntries(parsedCommits, addLogging) {
    var currentChangeLog = fs.readFileSync(constants.CHANGE_LOG_PATH);
    var filteredResults = [];
    parsedCommits.forEach(function(map) {
      if (!currentChangeLog.includes('PR #' + map[constants.PR_NUM])) {
        filteredResults.push(map);
      } else if (addLogging) {
        console.log(
          '\n' +
            util.format(
              'Filtered PR number %s. An entry already exists in the changelog.',
              map[constants.PR_NUM]
            )
        );
      }
    });
    return filteredResults;
  },

  /**
   * Groups all messages per package header so they can be displayed under
   * the same package header subsection. Returns a map of lists.
   */
  getMessagesGroupedByPackage(parsedCommits, addLogging) {
    var groupedMessages = {};
    parsedCommits.forEach(function(map) {
      map[constants.PACKAGES].forEach(function(packageName) {
        groupedMessages[packageName] = groupedMessages[packageName] || [];
        groupedMessages[packageName].push(
          util.format(
            '\n- %s ([PR #%s](https://github.com/forcedotcom/salesforcedx-vscode/pull/%s))\n',
            map[constants.MESSAGE],
            map[constants.PR_NUM],
            map[constants.PR_NUM]
          )
        );
      });
    });
    if (addLogging) {
      console.log('\nMessages grouped by package:');
      console.log(groupedMessages);
    }
    return groupedMessages;
  },

  getChangeLogHeader(releaseBranch) {
    var releaseBranchNum = releaseBranch
      .toString()
      .replace(constants.RELEASE_BRANCH_PREFIX, '');
    var currentChangeLog = fs.readFileSync(constants.CHANGE_LOG_PATH);
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
};
