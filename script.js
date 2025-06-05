// -----------------------------------------------------------------------------
// Firebase SDK Imports (ESM syntax - ensure your HTML script tag has type="module")
// -----------------------------------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, serverTimestamp, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// -----------------------------------------------------------------------------
// Firebase Initialization & Authentication
// -----------------------------------------------------------------------------

// Your specific Firebase configuration (as provided by you)
const stoneFirebaseConfig = {
  apiKey: "AIzaSyDTHp45MDW0G-6JZrte8wOrBBgbcIfVD_U",
  authDomain: "stone-portfolio.firebaseapp.com",
  projectId: "stone-portfolio",
  storageBucket: "stone-portfolio.appspot.com", // Standard SDK format
  messagingSenderId: "708723609288",
  appId: "1:708723609288:web:ddaaa15b7c979d35115ffd",
  measurementId: "G-T9XT4EJS46"
};

// Use your specific config. Fallback to globals is removed for this "Firebase only" version.
const firebaseConfigToUse = stoneFirebaseConfig;
const appIdToUse = stoneFirebaseConfig.projectId; // Using your projectId for the Firestore path

// This would be provided by an environment like Canvas, or null for local dev using anonymous.
const initialAuthTokenFromGlobal = typeof __initial_auth_token !== 'undefined' 
    ? __initial_auth_token 
    : null;

let app;
let auth;
let db;
let currentUserId = null; 
let firebaseInitialized = false;

async function initializeFirebaseServices() {
    if (firebaseInitialized) return;

    if (firebaseConfigToUse && firebaseConfigToUse.apiKey) { // Basic check for config presence
        try {
            app = initializeApp(firebaseConfigToUse);
            auth = getAuth(app);
            db = getFirestore(app);
            // setLogLevel('debug'); // Uncomment for detailed Firestore logs during development
            console.log("Firebase initialized successfully with project ID:", firebaseConfigToUse.projectId);
            firebaseInitialized = true;

            onAuthStateChanged(auth, (user) => {
                if (user) {
                    currentUserId = user.uid;
                    console.log("User is signed in with UID:", currentUserId);
                } else {
                    console.log("User is signed out or auth state not yet determined.");
                    // If no user and not already attempting, try to sign in (primarily for anonymous)
                    if (!auth.currentUser && !initialAuthTokenFromGlobal) { 
                        signInUser();
                    }
                }
            });
            
            await signInUser(); // Attempt initial sign-in

        } catch (error) {
            console.error("Error initializing Firebase:", error);
            firebaseInitialized = false;
            const formMessageDisplay = document.getElementById('form-message'); // Assuming it exists
            if(formMessageDisplay) {
                displayFormMessage('Service connection error. Please try again later.', 'error', formMessageDisplay);
            }
        }
    } else {
        console.error("Firebase configuration is missing or incomplete. Contact form submissions to database will not work.");
        const formMessageDisplay = document.getElementById('form-message');
        if(formMessageDisplay) {
            displayFormMessage('Contact form is currently unavailable due to a configuration issue.', 'error', formMessageDisplay);
        }
    }
}

async function signInUser() {
    if (!auth) {
        console.error("Firebase Auth is not initialized. Cannot sign in.");
        return;
    }
    if (auth.currentUser) { 
        currentUserId = auth.currentUser.uid;
        return; // Already signed in
    }
    try {
        if (initialAuthTokenFromGlobal) {
            console.log("Attempting to sign in with custom token...");
            await signInWithCustomToken(auth, initialAuthTokenFromGlobal);
            console.log("Successfully signed in with custom token.");
        } else {
            console.log("No custom token. Attempting to sign in anonymously...");
            await signInAnonymously(auth);
            console.log("Successfully signed in anonymously.");
        }
        // onAuthStateChanged will update currentUserId
    } catch (error) {
        console.error("Error during Firebase sign-in:", error);
        currentUserId = 'anonymous_error_fallback'; // Fallback
    }
}

// Initialize Firebase as soon as the script loads
initializeFirebaseServices();


// -----------------------------------------------------------------------------
// Contact Form Handling with Firestore (runs after DOM is loaded)
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.getElementById('contactForm');
    const formMessageDisplay = document.getElementById('form-message'); 
    
    const disposableEmailDomains = [
        "mailinator.com", "tempmail.com", "10minutemail.com", "guerrillamail.com", "yopmail.com" 
    ];
    const MIN_MESSAGE_LENGTH = 10;

    if (contactForm && formMessageDisplay) {
        contactForm.addEventListener('submit', async function(event) {
            event.preventDefault(); 

            if (!firebaseInitialized || !db) {
                displayFormMessage('Contact service is currently unavailable. Please try again later.', 'error', formMessageDisplay);
                console.error("Firestore (db) or Firebase is not initialized for form submission.");
                return;
            }
            if (!appIdToUse) {
                displayFormMessage('Application configuration error. Cannot submit message.', 'error', formMessageDisplay);
                console.error("App ID (appIdToUse) is missing. Cannot construct Firestore path.");
                return;
            }
            if (!currentUserId) {
                console.log("User ID missing at submit, attempting to ensure authentication...");
                await signInUser(); // Ensure user is signed in (especially critical for anonymous)
                if (!currentUserId) { // Check again
                    displayFormMessage('Authentication problem. Please refresh the page and try again.', 'error', formMessageDisplay);
                    console.error("User still not authenticated after re-attempt. Cannot submit message.");
                    return;
                }
                console.log("Authenticated for submission, UID:", currentUserId);
            }

            const nameInput = document.getElementById('name');
            const emailInput = document.getElementById('email');
            const messageInput = document.getElementById('message');
            const honeypotInput = document.getElementById('nickname'); // Assumes id="nickname"

            const name = nameInput.value.trim();
            const email = emailInput.value.trim();
            const message = messageInput.value.trim();
            const honeypotValue = honeypotInput ? honeypotInput.value.trim() : "";

            if (honeypotInput && honeypotValue !== "") {
                console.warn("Honeypot filled. Likely spam.");
                displayFormMessage('Submission blocked.', 'error', formMessageDisplay); 
                return; 
            }

            if (!name || !email || !message) {
                displayFormMessage('Please fill in all required fields.', 'error', formMessageDisplay);
                return;
            }

            if (!isValidEmailFormat(email)) {
                displayFormMessage('Please enter a valid email address format.', 'error', formMessageDisplay);
                return;
            }

            const emailDomain = email.substring(email.lastIndexOf("@") + 1);
            if (disposableEmailDomains.includes(emailDomain.toLowerCase())) {
                displayFormMessage('Please use a permanent email address.', 'error', formMessageDisplay);
                return;
            }
            
            if (message.length < MIN_MESSAGE_LENGTH) {
                displayFormMessage(`Message should be at least ${MIN_MESSAGE_LENGTH} characters long.`, 'error', formMessageDisplay);
                return;
            }

            const messageData = {
                name: name,
                email: email,
                message: message,
                submittedAt: serverTimestamp(),
                appInstanceId: appIdToUse, 
                submitterUid: currentUserId
            };
            
            const submitButton = contactForm.querySelector('button[type="submit"]');
            const originalButtonText = submitButton.textContent;
            submitButton.disabled = true;
            submitButton.textContent = 'Sending...';

            try {
                // Firestore path: /artifacts/{appId}/public/data/contactMessages/{generatedMessageId}
                const messagesCollectionRef = collection(db, "artifacts", appIdToUse, "public", "data", "contactMessages");
                const docRef = await addDoc(messagesCollectionRef, messageData);
                
                console.log("Message sent to Firestore with ID: ", docRef.id);
                displayFormMessage('Message sent successfully! Thank you.', 'success', formMessageDisplay);
                contactForm.reset();

            } catch (error) {
                console.error('Error sending message to Firestore:', error);
                displayFormMessage('An error occurred while sending your message. Please try again.', 'error', formMessageDisplay);
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText;
            }
        });
    } else {
        if (!contactForm) console.error("Contact form with id 'contactForm' not found in the DOM.");
        if (!formMessageDisplay) console.error("Element with id 'form-message' for displaying messages not found in the DOM.");
    }
}); // End of DOMContentLoaded

// -----------------------------------------------------------------------------
// Helper Functions (Keep these for the form logic)
// -----------------------------------------------------------------------------
function displayFormMessage(message, type, displayElement) {
    // Ensure displayElement is valid, if not passed, try to get it.
    const targetDisplayElement = displayElement || document.getElementById('form-message');
    if (!targetDisplayElement) {
        console.warn("Form message display element not found. Message:", message);
        return; 
    }
    targetDisplayElement.textContent = message;
    targetDisplayElement.className = 'form-message-display visible';
    targetDisplayElement.classList.add(type);

    setTimeout(() => {
        targetDisplayElement.textContent = '';
        targetDisplayElement.className = 'form-message-display';
    }, 7000);
}

function isValidEmailFormat(email) {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
    return emailRegex.test(email);
}









document.addEventListener('DOMContentLoaded', () => {
    // Mobile Navigation Toggle
    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (navToggle && navLinks) {
        navToggle.addEventListener('click', () => {
            const isNavOpen = navLinks.classList.toggle('nav-active');
            navToggle.setAttribute('aria-expanded', isNavOpen);
            document.body.classList.toggle('nav-open', isNavOpen);
        });

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (navLinks.classList.contains('nav-active')) {
                    navLinks.classList.remove('nav-active');
                    navToggle.setAttribute('aria-expanded', 'false');
                    document.body.classList.remove('nav-open');
                }
            });
        });
    }

    // Smooth scrolling for all internal links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const hrefAttribute = this.getAttribute('href');
            if (hrefAttribute && hrefAttribute.startsWith('#') && hrefAttribute.length > 1) {
                const targetElement = document.querySelector(hrefAttribute);
                if (targetElement) {
                    e.preventDefault();
                    const headerHeight = document.querySelector('header')?.offsetHeight || 0;
                    const elementPosition = targetElement.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - headerHeight;

                    window.scrollTo({
                        top: offsetPosition,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });

    // Contact Form Handling with Webhook & Enhanced Validation
    const contactForm = document.getElementById('contactForm');
    const formMessageDisplay = document.getElementById('form-message');
    
    const WEBHOOK_URL = "YOUR_WEBHOOK_URL_HERE"; // !!! REPLACE THIS !!!

    const disposableEmailDomains = [
        "mailinator.com", "tempmail.com", "10minutemail.com", "guerrillamail.com", "yopmail.com" 
    ];
    const MIN_MESSAGE_LENGTH = 10;

    if (contactForm && formMessageDisplay) {
        contactForm.addEventListener('submit', async function(event) {
            event.preventDefault(); 

            const nameInput = document.getElementById('name');
            const emailInput = document.getElementById('email');
            const messageInput = document.getElementById('message');
            const honeypotInput = document.getElementById('nickname');

            const name = nameInput.value.trim();
            const email = emailInput.value.trim();
            const message = messageInput.value.trim();
            const honeypotValue = honeypotInput.value.trim();

            if (honeypotValue !== "") {
                console.warn("Honeypot field filled. Likely spam.");
                displayFormMessage('An error occurred. Please try again.', 'error'); 
                return; 
            }

            if (!name || !email || !message) {
                displayFormMessage('Please fill in all required fields.', 'error');
                return;
            }

            if (!isValidEmailFormat(email)) {
                displayFormMessage('Please enter a valid email address format.', 'error');
                return;
            }

            const emailDomain = email.substring(email.lastIndexOf("@") + 1);
            if (disposableEmailDomains.includes(emailDomain.toLowerCase())) {
                displayFormMessage('Please use a permanent email address.', 'error');
                return;
            }
            
            if (message.length < MIN_MESSAGE_LENGTH) {
                displayFormMessage(`Message should be at least ${MIN_MESSAGE_LENGTH} characters long.`, 'error');
                return;
            }

            const formData = {
                name: name,
                email: email,
                message: message,
                // access_key: "YOUR_WEB3FORMS_ACCESS_KEY_IF_NEEDED" 
                // subject: "New Portfolio Contact: " + name 
            };
            
            const submitButton = contactForm.querySelector('button[type="submit"]');
            const originalButtonText = submitButton.textContent;
            submitButton.disabled = true;
            submitButton.textContent = 'Sending...';

            try {
                if (WEBHOOK_URL === "YOUR_WEBHOOK_URL_HERE" || WEBHOOK_URL === "") {
                    console.error("Webhook URL is not set. Please update it in script.js.");
                    displayFormMessage('Form submission is not configured. Please contact the site owner.', 'error');
                    submitButton.disabled = false;
                    submitButton.textContent = originalButtonText;
                    return;
                }

                const response = await fetch(WEBHOOK_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });

                if (response.ok) {
                    displayFormMessage('Message sent successfully! Thank you.', 'success');
                    contactForm.reset();
                } else {
                    displayFormMessage(`Oops! Something went wrong (Error: ${response.status}). Please try again.`, 'error');
                }
            } catch (error) {
                console.error('Form submission error:', error);
                displayFormMessage('An error occurred. Please check your connection and try again.', 'error');
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText;
            }
        });
    }

    function displayFormMessage(message, type) {
        if (!formMessageDisplay) return;
        formMessageDisplay.textContent = message;
        formMessageDisplay.className = 'form-message-display visible';
        formMessageDisplay.classList.add(type);

        setTimeout(() => {
            formMessageDisplay.textContent = '';
            formMessageDisplay.className = 'form-message-display';
        }, 7000);
    }

    function isValidEmailFormat(email) {
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        return emailRegex.test(email);
    }

    const currentYearSpan = document.getElementById('currentYear');
    if (currentYearSpan) {
        currentYearSpan.textContent = new Date().getFullYear();
    }

    const sections = document.querySelectorAll('section[id]');
    const navAnchors = document.querySelectorAll('header nav ul li a');
    const headerHeight = document.querySelector('header')?.offsetHeight || 0;

    function updateActiveNavLink() {
        let currentSectionId = 'hero';
        const scrollPosition = pageYOffset + headerHeight + 70;

        sections.forEach(section => {
            if (scrollPosition >= section.offsetTop) {
                currentSectionId = section.getAttribute('id');
            }
        });

        navAnchors.forEach(a => {
            a.classList.remove('active');
            if (a.getAttribute('href') === `#${currentSectionId}`) {
                a.classList.add('active');
            }
        });
    }
    window.addEventListener('scroll', updateActiveNavLink);
    updateActiveNavLink();

    const animatedElements = document.querySelectorAll('.animate-on-scroll');
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.08
    };

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                let delay = 0;
                if (entry.target.classList.contains('project-card')) {
                    const parentGrid = entry.target.closest('.portfolio-grid');
                    if (parentGrid) {
                        const cardsInGrid = Array.from(parentGrid.querySelectorAll('.project-card.animate-on-scroll:not(.visible)'));
                        const cardIndexInGrid = cardsInGrid.indexOf(entry.target);
                        if (cardIndexInGrid !== -1) {
                           delay = cardIndexInGrid * 0.08;
                        }
                    }
                }
                entry.target.style.transitionDelay = `${delay}s`;
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    animatedElements.forEach(el => {
        observer.observe(el);
    });

    const scrollToTopBtn = document.getElementById('scrollToTopBtn');
    if (scrollToTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.pageYOffset > 350) {
                scrollToTopBtn.style.display = 'flex';
                setTimeout(() => scrollToTopBtn.style.opacity = '1', 20);
            } else {
                scrollToTopBtn.style.opacity = '0';
                setTimeout(() => {
                    if (window.pageYOffset <= 350) {
                         scrollToTopBtn.style.display = 'none';
                    }
                }, 300);
            }
        });

        scrollToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Mouse Follower Glow
    const mouseFollower = document.querySelector('.mouse-follower');
    if (mouseFollower) {
        let mouseX = 0, mouseY = 0;
        let followerX = 0, followerY = 0;
        const speed = 0.2; // Adjusted speed for mouse follower

        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
            if (mouseFollower.style.opacity === '0' || mouseFollower.style.opacity === '') {
                 mouseFollower.style.opacity = '0.35';
            }
        });
        
        let animationFrameId = null;
        function animateFollower() {
            let dx = mouseX - followerX;
            let dy = mouseY - followerY;
            followerX += dx * speed;
            followerY += dy * speed;
            mouseFollower.style.transform = `translate(${followerX}px, ${followerY}px) translate(-50%, -50%)`;
            animationFrameId = requestAnimationFrame(animateFollower);
        }

        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || /Mobi|Android/i.test(navigator.userAgent);
        if (!isTouchDevice) {
            animateFollower();
        } else {
            mouseFollower.style.display = 'none';
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
        }
    }

    // Video Modal Functionality with In/Out Animations
    const videoModal = document.getElementById('videoModal');
    const videoModalContent = videoModal ? videoModal.querySelector('.video-modal-content') : null;
    const videoModalIframe = document.getElementById('videoModalIframe');
    const viewProjectBtns = document.querySelectorAll('.view-project-btn');
    const closeVideoModalBtn = document.querySelector('.close-video-modal');

    // Get animation duration from CSS variable
    const modalAnimationDuration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--modal-animation-duration') || '0.4') * 1000;


    if (videoModal && videoModalContent && videoModalIframe && viewProjectBtns.length > 0 && closeVideoModalBtn) {
        viewProjectBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); 
                const videoSrc = btn.getAttribute('data-video-src');
                if (videoSrc && videoSrc.trim() !== "") { 
                    let finalVideoSrc = videoSrc;
                    // Add autoplay parameters
                    if (finalVideoSrc.includes('youtube.com/embed')) {
                        finalVideoSrc += (finalVideoSrc.includes('?') ? '&' : '?') + 'autoplay=1&rel=0';
                    } else if (finalVideoSrc.includes('player.vimeo.com/video')) {
                        finalVideoSrc += (finalVideoSrc.includes('?') ? '&' : '?') + 'autoplay=1&title=0&byline=0&portrait=0';
                    }

                    videoModalIframe.setAttribute('src', finalVideoSrc);
                    videoModal.classList.remove('video-modal-closing'); // Ensure no closing animation is running
                    videoModalContent.style.animation = ''; // Clear previous animation
                    videoModal.classList.add('active'); // This triggers overlay fade-in and content in-animation via CSS
                    document.body.classList.add('modal-open');
                } else {
                    console.error("Button does not have a valid data-video-src attribute:", btn);
                }
            });
        });

        function closeModal() {
            videoModal.classList.add('video-modal-closing'); // Trigger out-animation
            document.body.classList.remove('modal-open'); // Allow scroll immediately

            // Wait for the out-animation to finish before fully hiding and resetting
            setTimeout(() => {
                videoModal.classList.remove('active');
                videoModal.classList.remove('video-modal-closing');
                videoModalIframe.setAttribute('src', ''); // Stop video
                videoModalContent.style.animation = ''; // Clear animation for next open
            }, modalAnimationDuration); 
        }

        closeVideoModalBtn.addEventListener('click', closeModal);

        videoModal.addEventListener('click', (event) => {
            if (event.target === videoModal) { 
                closeModal();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && videoModal.classList.contains('active')) {
                closeModal();
            }
        });
    } else {
        console.error("Video modal elements not found. Check HTML IDs and classes.");
    }
});
