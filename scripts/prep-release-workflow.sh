#!/usr/bin/env bash
CircleCIToken=$1
ReleaseBranch=$2
curl -v -u ${CircleCIToken}: -X POST --header "Content-Type: application/json" -d '{
  "branch": "release/v'${ReleaseBranch}'",
  "parameters": {
    "prep-release": true
  }
}' https://circleci.com/api/v2/project/gh/sfsholden/salesforcedx-vscode-sholden/pipeline

# open the release pipe line url
open "https://app.circleci.com/pipelines/github/sfsholden/salesforcedx-vscode-sholden"
