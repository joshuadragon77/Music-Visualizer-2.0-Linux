#!/bin/env sh

echo "Typescript Building..."
tsc
cd resources; tsc;

echo "Creating other important directories...";

cd ..;
mkdir stores/
mkdir lyrics/

echo "Starting...";


node .;