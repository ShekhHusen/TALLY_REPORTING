const fs = require('fs');
const content = fs.readFileSync('src/components/UpdateFollowUpModal.jsx', 'utf-8');

const updated = content
    .replace('onSuccess \n})', 'onSuccess,\n  initialTab = \'update\'\n})')
    .replace('// If already completed, default to history view', '// Respect initialTab prop, override if already completed')
    .replace('if (followUp.completed) {', 'if (followUp.completed || initialTab === \'history\') {')
    .replace('}, [isOpen, followUp, currentUser]);', '}, [isOpen, followUp, currentUser, initialTab]);');

fs.writeFileSync('src/components/UpdateFollowUpModal.jsx', updated);
console.log("Success");
