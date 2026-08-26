#!/data/data/com.termux/files/usr/bin/bash

cd ~/dogeshbhoi || exit 1

printf "Owner username: "
IFS= read -r ADMIN_USERNAME

printf "Owner password (16+ chars): "
IFS= read -r -s ADMIN_PASSWORD
printf "\n"

echo
echo "Username received: $ADMIN_USERNAME"
echo "Password length: ${#ADMIN_PASSWORD}"

if ! [[ "$ADMIN_USERNAME" =~ ^[a-z0-9._-]{3,32}$ ]]; then
  echo "ERROR: username must be 3-32 lowercase chars, numbers, dot, _ or -"
  exit 1
fi

if [ "${#ADMIN_PASSWORD}" -lt 16 ]; then
  echo "ERROR: password must be at least 16 characters"
  exit 1
fi

export ADMIN_USERNAME
export ADMIN_PASSWORD
export ADMIN_ROLE=owner

npm run make-first-admin

unset ADMIN_USERNAME
unset ADMIN_PASSWORD
unset ADMIN_ROLE
