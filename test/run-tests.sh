#!/bin/bash
# Test runner for afk

echo "================================"
echo "Running afk test suite"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Track overall status
ALL_PASSED=true

# Run permission tests
echo "Running permission matching tests..."
node test/test-permissions.js
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Permission tests failed${NC}"
  ALL_PASSED=false
else
  echo -e "${GREEN}✅ Permission tests passed${NC}"
fi

echo ""

# Run integration tests
echo "Running integration tests..."
node test/test-integration.js
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Integration tests failed${NC}"
  ALL_PASSED=false
else
  echo -e "${GREEN}✅ Integration tests passed${NC}"
fi

echo ""

# Run runtime error detection tests
echo "Running runtime error detection tests..."
node test/test-runtime.js
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Runtime tests failed${NC}"
  ALL_PASSED=false
else
  echo -e "${GREEN}✅ Runtime tests passed${NC}"
fi

echo ""

# Test actual afk binary syntax
echo "Testing afk binary syntax..."
node -c bin/afk
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Syntax check failed${NC}"
  ALL_PASSED=false
else
  echo -e "${GREEN}✅ Syntax check passed${NC}"
fi

echo ""
echo "================================"

if [ "$ALL_PASSED" = true ]; then
  echo -e "${GREEN}🎉 All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}⚠️  Some tests failed${NC}"
  exit 1
fi