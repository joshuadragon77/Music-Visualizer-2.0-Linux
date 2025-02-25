#!/usr/bin/env sh

echo "Downloading required packages..."

npm i 

echo "Typescript Building..."
tsc
cd resources; tsc;

echo "Creating other important directories...";

cd ..;
mkdir stores/
mkdir lyrics/

echo "Starting...";


node .;
