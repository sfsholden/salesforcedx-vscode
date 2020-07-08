CircleCIToken=$1
curl -v -u ${CircleCIToken}: -X POST --header "Content-Type: application/json" -d '{
  "branch": "develop",
  "parameters": {
    "create-release": true
  }
}' https://circleci.com/api/v2/project/gh/sfsholden/salesforcedx-vscode-sholden/pipeline
