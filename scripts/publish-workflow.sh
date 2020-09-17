#!/usr/bin/env bash
CircleCIToken=$1
curl -v -u ${CircleCIToken}: -X POST --header "Content-Type: application/json" -d '{
  "branch": "main",
  "parameters": {
    "publish": true
  }
}' https://circleci.com/api/v2/project/gh/sfsholden/salesforcedx-vscode-sholden/pipeline
